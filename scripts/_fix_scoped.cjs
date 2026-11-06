const fs = require("fs"),
  path = require("path");
const root = process.cwd();
const fixes = [
  ["platform/windows", [[/(["'`(=\s]|^)core\//g, "$1src/"]]],
  [
    "web/public",
    [
      [/media\/attribution\//g, "assets/licenses/"],
      [/(["'`(=\/]|^)media\//g, "$1assets/"],
      [/(["'`(=\/]|^)samples\//g, "$1examples/"],
      [/guides\/platform\//g, "guides/native/"],
    ],
  ],
  ["handbook", [[/(["'`(=\s]|^)media\//g, "$1assets/"]]],
];
let tot = 0;
for (const [dir, subs] of fixes) {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) continue;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", ".git", "dist"].includes(e.name)) walk(p);
      } else if (
        /\.(ts|js|mjs|cjs|json|md|mdx|html|htm|css|scss|yml|yaml|txt|vue|svg|xml|lua|py|sh|ps1|cfg|ini|toml)$/i.test(
          e.name,
        )
      ) {
        let s = fs.readFileSync(p, "utf8");
        const o = s;
        for (const [re, r] of subs) s = s.replace(re, r);
        if (s !== o) {
          fs.writeFileSync(p, s);
          tot++;
        }
      }
    }
  })(base);
}
console.log("patched files:", tot);
