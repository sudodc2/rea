// Fix references to NESTED dirs that kept old names after the top-level rename.
// e.g. real dir provider-bridges/native was referenced as provider-bridges/platform.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAP = {
  src: 'core', tests: 'spec', docs: 'handbook', scripts: 'tooling',
  bridge: 'provider-bridges', third_party: 'vendor', native: 'platform',
  assets: 'media', examples: 'samples', licenses: 'attribution',
  website: 'web', reports: 'verification', patches: 'overlays',
};
const OLD = new Set(Object.keys(MAP));
const root = process.cwd();
const GIT = 'C:\\Users\\Intentions\\.tools\\mingit\\cmd\\git.exe';
const git = (a) => execSync(`"${GIT}" ${a}`, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// 1. Find all real dirs (post-rename) whose NAME is an old top-level name, at depth >= 2
const SKIP = new Set(['node_modules', '.git', 'dist', '.turbo', '.cache']);
const kept = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name)) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    const depth = r.split('/').length;
    if (depth >= 2 && OLD.has(e.name)) kept.push(r);
    walk(path.join(dir, e.name), r);
  }
})(root, '');
console.log('kept-old dirs:', kept.join(', '));

// 2. For each, compute wrong ref W and real path P
const fixes = [];
for (const p of kept) {
  const comps = p.split('/');
  // wrong form: each comp that is an OLD name -> its MAP value (as if it had been renamed)
  const wcomps = comps.map(c => OLD.has(c) ? MAP[c] : c);
  fixes.push({ real: p, wrong: wcomps.join('/'), wcomps, rcomps: comps });
}
// deepest first so nested fixes don't get shadowed
fixes.sort((a, b) => b.real.split('/').length - a.real.split('/').length);

// 3. Rewrite in all tracked text files
const files = git('ls-files').split('\n').filter(Boolean);
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|yml|yaml|toml|sh|bash|zsh|ps1|py|java|swift|rs|txt|cfg|ini|html|htm|css|scss|svg|xml|gitmodules|gitattributes|npmrc|nvmrc|editorconfig|csv|graphql|proto|lua|luau|c|h|cpp|hpp|cmake|mk|bat|cmd|reg|iss|nsi|cs|go|rb|php|service|desktop|plist|metal|wgsl|glsl|vert|frag|wxs|wxi|xaml|resx|rockspec|makefile)$/i;
const NOEXT = /^(LICENSE|NOTICE|CHANGELOG|CONTRIBUTING|SECURITY|README|AGENTS|CLAUDE|CODEOWNERS|Makefile|Dockerfile|\.git.*|\.npmrc|\.nvmrc|\.ox.*|\.jscpd.*|\.husky.*|\.release.*|install\.sh|server\.json|knip.*|stryker.*)$/i;

let touched = 0, subs = 0;
for (const rel of files) {
  const fp = path.join(root, rel);
  let buf;
  try { buf = fs.readFileSync(fp); } catch { continue; }
  if (buf.includes(0)) continue;
  let s = buf.toString('utf8');
  if (!s) continue;
  const orig = s;
  for (const f of fixes) {
    // slash form: wrong/path/file -> real/path/file  (also matches wrong dir at end via quote/paren boundary)
    const wRe = new RegExp(f.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\w-])', 'g');
    s = s.replace(wRe, f.real);
    // quoted-args sequence: "w1", "w2", "w3" -> "r1", "r2", "r3"  (join(root, ...) style)
    if (f.wcomps.length >= 2) {
      const q = f.wcomps.map(c => `(["'\`])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`).join('\\s*,\\s*');
      const rSeq = f.rcomps.map(c => `$1${c}$1`).join(', ');
      // rebuild with captured quote chars preserved per-component is complex; use function
      const seqRe = new RegExp(q, 'g');
      s = s.replace(seqRe, (...m) => {
        // m[0]=full; extract quoted comps in order and map positionally
        const parts = m[0].split(',');
        return parts.map((pt, i) => pt.replace(/(["'`])[^"'`]*\1/, `$1${f.rcomps[i]}$1`)).join(',');
      });
    }
  }
  if (s !== orig) { fs.writeFileSync(fp, s); touched++; }
}
console.log(`fixed refs in ${touched} files`);
for (const f of fixes) console.log(`  ${f.wrong} -> ${f.real}`);
