#!/usr/bin/env node
/**
 * rea-lua — Luau/Lua artifact inspector.
 *
 * REA's upstream tree has no Lua coverage. This module statically analyzes
 * Luau artifacts — obfuscated scripts, packed payloads, VM loaders, and
 * compiled bytecode — and emits a structured report: format fingerprint,
 * payload metrics, network surface, executor API usage, and entropy profile.
 *
 * All findings are static observations of artifact bytes. Nothing here
 * executes the target, contacts a remote endpoint, or claims runtime behavior.
 *
 * Usage:
 *   node lua/rea-lua.mjs <file> [--json] [--strings N]
 *
 * Exit codes: 0 ok, 1 unreadable input, 2 unknown format (still reports).
 */

import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const B85A = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
const B85SET = new Set(B85A.split(''));

/* ------------------------------------------------------------------ */
/* Format fingerprints — scored, not first-match                        */
/* ------------------------------------------------------------------ */
const FINGERPRINTS = [
  {
    id: 'vx-packed',
    label: 'VX packed bytecode',
    weight: 3,
    signals: [
      { re: null, test: (buf) => buf.length > 70 && buf[0] === 0x56 && buf[1] === 0x58, note: 'VX magic header' },
      { re: /(?:loadstring|game:HttpGet)[\s\S]{0,400}(?:0x56|serialize|__SEC)/, note: 'VX loader idioms' },
    ],
  },
  {
    id: 'luraph',
    label: 'Luraph obfuscator',
    weight: 3,
    signals: [
      { re: /LPH[:_A-Z]*|\[Luraph\]|luraph/i, note: 'Luraph marker' },
      { re: /LPH_NO_VIRTUALIZE|LPH_ENCSTR|LPH_JIT/, note: 'Luraph macro surface' },
    ],
  },
  {
    id: 'moonveil',
    label: 'MoonVeil obfuscator',
    weight: 2,
    signals: [{ re: /MoonVeil|moonveil/i, note: 'MoonVeil marker' }],
  },
  {
    id: 'ironbrew',
    label: 'IronBrew obfuscator',
    weight: 2,
    signals: [{ re: /IronBrew|ironbrew|IB2?_ENC/i, note: 'IronBrew marker' }],
  },
  {
    id: 'psu',
    label: 'PSU / ProtectScript.us',
    weight: 2,
    signals: [{ re: /protectscript\.us|psu\.lol|PSU[_ ]?Obfuscator/i, note: 'PSU marker' }],
  },
  {
    id: 'custom-b85-xor',
    label: 'Custom base85/XOR loader',
    weight: 1,
    signals: [
      { re: /local\s+\w+\s*=\s*\w+\["?\\?x?b?y?t?e"?\]|string\.byte|string\.char/, note: 'byte-level codec primitives' },
      { re: /(?:bxor|band|rshift|lshift|arshift)/, note: 'bit32 transform use' },
    ],
  },
  {
    id: 'luau-plain',
    label: 'Plain Luau source',
    weight: 1,
    signals: [
      { re: /^\s*(--.*\n)?\s*(local|function|return|if|for|while|do)\b/m, note: 'Luau statement head' },
    ],
  },
  {
    id: 'luau-bytecode',
    label: 'Luau bytecode',
    weight: 3,
    signals: [
      { re: null, test: (buf) => buf.length > 4 && buf[0] === 0x1b && buf[1] === 0x4c && buf[2] === 0x75 && buf[3] === 0x61, note: 'ESC Lua signature' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Metrics                                                              */
/* ------------------------------------------------------------------ */
function shannonEntropy(buf) {
  const freq = new Array(256).fill(0);
  for (const b of buf) freq[b]++;
  let e = 0;
  for (const f of freq) {
    if (f) { const p = f / buf.length; e -= p * Math.log2(p); }
  }
  return e;
}

function printableRuns(text, minLen = 6, maxRuns = 400) {
  const out = [];
  const seen = new Set();
  const re = /[\x20-\x7e]{6,}/g;
  let m;
  while ((m = re.exec(text)) && out.length < maxRuns) {
    const s = m[0];
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

function detectLongStrings(text) {
  const runs = [];
  const re = /\[(=*)\[/g;
  let m;
  while ((m = re.exec(text)) && runs.length < 1000) {
    const level = m[1].length;
    const close = `]${m[1]}]`;
    const end = text.indexOf(close, m.index + m[0].length);
    if (end === -1) continue;
    runs.push({ level, bytes: end - m.index });
    re.lastIndex = end + close.length;
  }
  return runs;
}

const ENV_PROBES = [
  'identifyexecutor', 'getgenv', 'getrenv', 'getfenv', 'setfenv', 'gethui',
  'hookfunction', 'hookmetamethod', 'newcclosure', 'checkcaller',
  'iscclosure', 'isexecutorclosure', 'islclosure', 'getgc', 'getreg',
  'debug.getinfo', 'debug.info', 'debug.getconstants', 'getupvalues',
  'getproto', 'setreadonly', 'setscriptable', 'request', 'http_request',
  'websocket', 'crypt', 'buffer.', 'bit32.', 'utf8.', 'game:GetService',
  'task.wait', 'task.spawn', 'coroutine.', 'loadstring', 'load',
];

const SUSPICIOUS_GLOBALS = [
  'hookfunction', 'hookmetamethod', 'newcclosure', 'getgc', 'getreg',
  'getproto', 'getconstants', 'getupvalues', 'debug.getinfo', 'setreadonly',
  'setscriptable', 'getconnections', 'firesignal', 'fireserver',
];

const NETWORK_PATTERNS = [
  { id: 'discord-webhook', re: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/g, severity: 'high' },
  { id: 'http-url', re: /https?:\/\/[\w.-]+(?::\d+)?(?:\/[\w\-./?%&=#]*)?/g, severity: 'info' },
  { id: 'game-httpget', re: /game:HttpGet|game:HttpPost|HttpGetAsync|HttpPostAsync|request\s*\(/g, severity: 'info' },
  { id: 'websocket', re: /WebSocket|websocket\.connect/g, severity: 'info' },
  { id: 'loadstring-remote', re: /loadstring\s*\([^)]*(?:HttpGet|request|\.Source)/g, severity: 'medium' },
];

function countMatches(text, re) {
  const out = new Map();
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text))) {
    const v = m[0];
    out.set(v, (out.get(v) || 0) + 1);
    if (out.size > 500) break;
  }
  return [...out.entries()].map(([value, count]) => ({ value, count }));
}

function fingerprint(text, buf) {
  const scored = [];
  for (const fp of FINGERPRINTS) {
    let score = 0;
    const hits = [];
    for (const sig of fp.signals) {
      if (sig.re && sig.re.test(text)) { score += fp.weight; hits.push(sig.note); }
      else if (sig.test && sig.test(buf, text)) { score += fp.weight; hits.push(sig.note); }
    }
    if (score > 0) scored.push({ ...fp, score, signals: hits });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function unescapeLua(text) {
  // Decode \xNN, \ddd, \n \t escapes inside quoted strings — enough to
  // recover many obfuscator string constants without executing anything.
  return text.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
             .replace(/\\(\d{1,3})/g, (_, d) => String.fromCharCode(parseInt(d, 10) % 256));
}

/* ------------------------------------------------------------------ */
/* Report                                                               */
/* ------------------------------------------------------------------ */
export function analyzeBuffer(buf, name = 'input') {
  const head = buf.subarray(0, Math.min(buf.length, 4 * 1024 * 1024));
  const text = head.toString('latin1');

  const scored = fingerprint(text, buf);
  const entropy = shannonEntropy(buf.subarray(0, Math.min(buf.length, 1 << 20)));

  const probes = ENV_PROBES.filter(p => text.includes(p));
  const globals = SUSPICIOUS_GLOBALS.filter(p => text.includes(p));
  const longStrings = detectLongStrings(text);
  const runs = printableRuns(text.slice(0, 512 * 1024), 8);

  let b85 = 0;
  const b85n = Math.min(head.length, 65536);
  for (const b of head.subarray(0, b85n)) {
    if (B85SET.has(String.fromCharCode(b))) b85++;
  }
  const b85Ratio = +(b85 / b85n).toFixed(3);

  const network = {};
  for (const np of NETWORK_PATTERNS) {
    const hits = countMatches(text, np.re);
    if (hits.length) network[np.id] = { severity: np.severity, matches: hits.slice(0, 25), total: hits.reduce((a, h) => a + h.count, 0) };
  }

  const functionDefs = (text.match(/\bfunction\b/g) || []).length;
  const loadstringCalls = (text.match(/\bloadstring\s*\(/g) || []).length;
  const pcallCalls = (text.match(/\b(?:p|x)?call\s*\(/g) || []).length;

  const decoded = unescapeLua(text.slice(0, 256 * 1024));
  const decodedStrings = printableRuns(decoded, 8).filter(s => /[a-zA-Z]{4}/.test(s)).slice(0, 60);

  const report = {
    file: name,
    size_bytes: buf.length,
    fingerprints: scored.map(f => ({ id: f.id, label: f.label, score: f.score, signals: f.signals })),
    primary_format: scored.length ? scored[0].id : 'unknown',
    metrics: {
      entropy_bits_per_byte: +entropy.toFixed(3),
      b85_alphabet_density: b85Ratio,
      long_string_blocks: longStrings.length,
      long_string_bytes: longStrings.reduce((a, l) => a + l.bytes, 0),
      function_definitions: functionDefs,
      loadstring_calls: loadstringCalls,
      pcall_family_calls: pcallCalls,
      env_probes_found: probes.length,
      suspicious_globals: globals.length,
      printable_strings_sampled: runs.length,
    },
    env_probes: probes,
    suspicious_globals: globals,
    network_surface: network,
    long_string_blocks: longStrings.slice(0, 20),
    strings: runs.slice(0, 200),
    decoded_strings: decodedStrings,
    limitations: [
      'Static byte analysis only; the artifact is never executed.',
      'String recovery is limited to escape-sequence decoding; runtime-constructed strings (string.char/concat chains) are not resolved.',
      'Fingerprint scores are heuristic; a low score does not prove absence of obfuscation.',
      'Network surface lists literal URLs and call sites; it does not verify reachability or intent.',
    ],
  };
  return report;
}

function analyzeFile(path) {
  const st = statSync(path);
  const buf = readFileSync(path);
  const r = analyzeBuffer(buf, basename(path));
  r.size_bytes = st.size;
  return r;
}

/* ------------------------------------------------------------------ */
/* CLI (skipped when imported as a module)                             */
/* ------------------------------------------------------------------ */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  const wantJson = args.includes('--json');
  const strLimit = +(args.find(a => a.startsWith('--strings='))?.split('=')[1] || 200);

  if (!file) {
    console.error('usage: node lua/rea-lua.mjs <file> [--json] [--strings N]');
    process.exit(1);
  }

  try {
    const r = analyzeFile(file);
    if (wantJson) {
      r.strings = r.strings.slice(0, strLimit);
      r.decoded_strings = r.decoded_strings.slice(0, strLimit);
      console.log(JSON.stringify(r, null, 2));
    } else {
      const top = r.fingerprints[0];
      console.log(`# ${r.file} — ${top ? top.label : 'Unknown Luau artifact'}`);
      if (r.fingerprints.length > 1) {
        console.log(`alt fingerprints: ${r.fingerprints.slice(1).map(f => `${f.id}(${f.score})`).join(', ')}`);
      }
      console.log(`size: ${r.size_bytes} bytes`);
      console.log(`entropy: ${r.metrics.entropy_bits_per_byte} bits/byte`);
      console.log(`b85 density: ${r.metrics.b85_alphabet_density}`);
      console.log(`long-string blocks: ${r.metrics.long_string_blocks} (${r.metrics.long_string_bytes} bytes)`);
      console.log(`functions: ${r.metrics.function_definitions}  loadstring calls: ${r.metrics.loadstring_calls}`);
      console.log(`env probes (${r.env_probes.length}): ${r.env_probes.join(', ') || 'none'}`);
      console.log(`suspicious globals (${r.suspicious_globals.length}): ${r.suspicious_globals.join(', ') || 'none'}`);
      const net = Object.entries(r.network_surface);
      if (net.length) {
        console.log('\nnetwork surface:');
        for (const [id, n] of net) {
          console.log(`  [${n.severity}] ${id}: ${n.total} match(es)`);
          n.matches.slice(0, 8).forEach(m => console.log(`    ${JSON.stringify(m.value)}`));
        }
      }
      if (r.strings.length) {
        console.log('\nstrings (sample):');
        r.strings.slice(0, strLimit).forEach(s => console.log('  ' + JSON.stringify(s)));
      }
    }
    process.exit(r.primary_format === 'unknown' ? 2 : 0);
  } catch (e) {
    console.error('rea-lua: ' + (e.message || e));
    process.exit(1);
  }
}
