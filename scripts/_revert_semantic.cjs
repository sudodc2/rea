// Revert quoted-bare "newname" -> "oldname" on lines changed by the rename,
// protecting tokens inside path-call arg lists (join/resolve/etc.).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const MAP = [
  ["src", "core"],
  ["tests", "spec"],
  ["docs", "handbook"],
  ["scripts", "tooling"],
  ["bridge", "provider-bridges"],
  ["third_party", "vendor"],
  ["native", "platform"],
  ["assets", "media"],
  ["examples", "samples"],
  ["licenses", "attribution"],
  ["website", "web"],
  ["reports", "verification"],
  ["patches", "overlays"],
];
const NEW2OLD = Object.fromEntries(MAP.map(([o, n]) => [n, o]));
const root = process.cwd();
const GIT = "C:\\Users\\Intentions\\.tools\\mingit\\cmd\\git.exe";
const git = (a) =>
  execSync(`"${GIT}" ${a}`, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

// config files handled separately — skip them here
const SKIP_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "tsconfig.frida-verification.json",
  "tsconfig.reverse-tools-mutation.json",
  "knip.json",
  "knip.production.json",
  "stryker.config.mjs",
  "stryker.semantics.config.mjs",
  "turbo.json",
  "vitest.config.ts",
]);

const PATHCALL =
  /\b(join|resolve|relative|dirname|joinPath|normalize|copyFile|mkdir|writeFile|readFile|existsSync|readdir|stat|lstat|realpath|createReadStream|createWriteStream|watch|open|opendir|rename|unlink|rm|cp|mv|appendFile|createWriteStream|createReadStream|import\.meta\.resolve)\s*\(/g;

// mask quoted-bare tokens inside path-call spans on a single line
function maskPathArgs(line) {
  const spans = [];
  PATHCALL.lastIndex = 0;
  let m;
  while ((m = PATHCALL.exec(line))) {
    // scan forward for balanced parens (approx: to end of line if unbalanced)
    let depth = 0,
      i = m.index + m[0].length - 1,
      end = line.length;
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    spans.push([m.index + m[0].length - 1, end]);
  }
  // mask = replace "newname" inside spans with placeholder
  const chars = line.split("");
  for (const [a, b] of spans) {
    for (let i = a; i <= b && i < chars.length; i++) {
      // crude: mask any "newname" fully inside span
    }
  }
  // simpler: token-level — find all quoted-bare newnames, keep those whose
  // position falls inside a span
  return { spans, chars };
}

function revertLine(line) {
  // find all quoted-bare occurrences of new names
  const re =
    /(["'`])(core|spec|handbook|tooling|provider-bridges|vendor|platform|media|samples|attribution|web|verification|overlays)\1/g;
  const { spans } = maskPathArgs(line);
  const inSpan = (pos) => spans.some(([a, b]) => pos >= a && pos <= b);
  return line.replace(re, (m, q, name, offset) => {
    if (inSpan(offset)) return m; // path arg — keep
    const old = NEW2OLD[name];
    return q + old + q;
  });
}

// parse git diff -U0, collect +line contents per file with new-file line numbers
const diff = git("diff -U0 -- .");
const hunks = diff.split(/^diff --git /m).slice(1);
let filesChanged = 0,
  linesChanged = 0;
const byFile = new Map(); // file -> Map<lineNo, text>
for (const h of hunks) {
  const headerEnd = h.indexOf("@@");
  if (headerEnd < 0) continue;
  const fileMatch = h.match(/^a\/(.+?) b\/(.+)$/m);
  if (!fileMatch) continue;
  const newPath = fileMatch[2];
  if (SKIP_FILES.has(path.basename(newPath)) && newPath.includes("/")) {
    /* still process subdir configs? skip only root ones */
  }
  if (SKIP_FILES.has(newPath)) continue;
  // parse hunks
  const lines = h.slice(headerEnd).split("\n");
  let newLine = null;
  const edits = [];
  for (const ln of lines) {
    const hm = ln.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hm) {
      newLine = parseInt(hm[1], 10);
      continue;
    }
    if (newLine === null) continue;
    if (ln.startsWith("+") && !ln.startsWith("+++")) {
      edits.push([newLine, ln.slice(1)]);
      newLine++;
    } else if (ln.startsWith("-")) {
      // removed line: newLine unchanged
    } else if (ln.startsWith(" ")) {
      newLine++;
    }
  }
  if (edits.length) byFile.set(newPath, edits);
}

for (const [rel, edits] of byFile) {
  const fp = path.join(root, rel);
  let content;
  try {
    content = fs.readFileSync(fp, "utf8");
  } catch {
    continue;
  }
  const fileLines = content.split("\n");
  let changed = false;
  for (const [ln, text] of edits) {
    // verify current line matches diff +line (sanity)
    if (fileLines[ln - 1] === undefined) continue;
    const reverted = revertLine(fileLines[ln - 1]);
    if (reverted !== fileLines[ln - 1]) {
      fileLines[ln - 1] = reverted;
      changed = true;
      linesChanged++;
    }
  }
  if (changed) {
    fs.writeFileSync(fp, fileLines.join("\n"));
    filesChanged++;
  }
}
console.log(
  `reverted quoted-bare on ${linesChanged} lines across ${filesChanged} files`,
);
