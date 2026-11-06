// Resolve-aware fix: relative imports ('../x', './x') that now point at
// wrong (renamed) segments for KEPT nested dirs. Rewrites specifier so it
// resolves to the real on-disk path.
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
const norm = p => p.split(path.sep).join('/').replace(/\\/g, '/');
const toRel = (fromDir, toPath) => {
  let r = path.posix.relative(fromDir.split(path.sep).join('/'), toPath.split(path.sep).join('/'));
  if (!r.startsWith('.')) r = './' + r;
  return r;
};

// kept dirs (same list as before, recompute)
const SKIP = new Set(['node_modules', '.git', 'dist', '.turbo', '.cache']);
const kept = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name)) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (r.split('/').length >= 2 && OLD.has(e.name)) kept.push(r);
    walk(path.join(dir, e.name), r);
  }
})(root, '');
const fixes = kept.map(p => {
  const comps = p.split('/');
  const w = comps.map(c => OLD.has(c) ? MAP[c] : c).join('/');
  return { real: p, wrong: w };
}).sort((a, b) => b.wrong.length - a.wrong.length);

const files = git('ls-files').split('\n').filter(Boolean);
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|yml|yaml|toml|sh|bash|zsh|ps1|py|java|swift|rs|txt|cfg|ini|html|htm|css|scss|svg|xml|lua|luau|c|h|cpp|hpp|cmake|mk|bat|cmd|go|rb|php|cs|metal|wgsl|glsl|service|desktop|plist|iss|nsi|wxs|wxi|xaml|resx|rockspec|makefile)$/i;
const NOEXT = /^(LICENSE|NOTICE|CHANGELOG|CONTRIBUTING|SECURITY|README|AGENTS|CLAUDE|CODEOWNERS|Makefile|Dockerfile|\.git.*|\.npmrc|\.nvmrc|\.ox.*|\.jscpd.*|\.husky.*|\.release.*|install\.sh|server\.json|knip.*|stryker.*)$/i;

// match relative refs in quotes/backticks: './x', '../x', '.\x', '..\x'
const REF = /(["'`])(\.{1,2}[\\/][^"'`\n]+?)\1/g;
let touched = 0, subs = 0;
const misses = [];
for (const rel of files) {
  const base = path.basename(rel);
  if (!TEXT_EXT.test(rel) && !NOEXT.test(base)) continue;
  const fp = path.join(root, rel);
  let buf;
  try { buf = fs.readFileSync(fp); } catch { continue; }
  if (buf.includes(0)) continue;
  let s = buf.toString('utf8');
  if (!s) continue;
  const fileDir = norm(path.dirname(rel));
  const orig = s;
  s = s.replace(REF, (m, q, ref) => {
    const refNorm = ref.replace(/\\/g, '/');
    const resolved = norm(path.posix.normalize(path.posix.join(fileDir === '.' ? '' : fileDir, refNorm)));
    for (const f of fixes) {
      if (resolved === f.wrong || resolved.startsWith(f.wrong + '/')) {
        const realTarget = f.real + resolved.slice(f.wrong.length);
        const newRef = toRel(fileDir === '.' ? '' : fileDir, realTarget);
        subs++;
        return q + newRef + q;
      }
    }
    return m;
  });
  if (s !== orig) { fs.writeFileSync(fp, s); touched++; }
}
console.log(`fixed ${subs} relative refs in ${touched} files`);
