# rea-lua — Luau/Lua artifact analyzer

Static inspector for Luau/Lua artifacts. REA's upstream tree has no Lua
coverage; this module fills that gap for Roblox/Luau targets: obfuscated
scripts, packed payloads, VM loaders, and compiled bytecode.

The artifact is **never executed**. All findings are observations of the
bytes on disk — no remote calls, no environment probes, no claims about
runtime behavior.

## Usage

```sh
node lua/rea-lua.mjs <file>            # human-readable report
node lua/rea-lua.mjs <file> --json     # machine-readable report
node lua/rea-lua.mjs <file> --strings 50
```

Importable as a module:

```js
import { analyzeBuffer } from "./lua/rea-lua.mjs";
const report = analyzeBuffer(buf, "target.lua");
```

## What it reports

- **Format fingerprint** — scored candidates: `vx-packed`, `luraph`,
  `moonveil`, `ironbrew`, `psu`, `custom-b85-xor`, `luau-plain`,
  `luau-bytecode`, or `unknown`. Scores are heuristic; the runner lists
  alternates.
- **Payload metrics** — Shannon entropy (first MiB), base85-alphabet
  density, long-string `[==[ ]==]` block count and total bytes, function
  definition count, `loadstring` call count, `pcall`-family call count.
- **Executor API surface** — presence of `getfenv`, `hookfunction`,
  `getgc`, `debug.*`, `request`, `loadstring`, `game:GetService`, etc.
- **Suspicious globals** — hook/introspection primitives
  (`hookmetamethod`, `getproto`, `getconstants`, `firesignal`, …).
- **Network surface** — literal Discord webhook URLs, `http(s)://` URLs,
  `game:HttpGet`/`request()` call sites, `loadstring`-remote patterns,
  WebSocket references. Severity-tagged; reachability is not verified.
- **Strings** — printable runs plus `\xNN`/`\ddd` escape-decoded samples.
  Runtime-constructed strings (`string.char`/`concat` chains) are not
  resolved — that is a documented limitation, not a gap in coverage.

## Fixtures and regression runner

```sh
node lua/tests/run.mjs
```

Analyzes every file in `lua/tests/fixtures/` and writes JSON reports to
`verification/lua/`. Exits non-zero on analyzer crashes or unexpected primary
formats. Machine-readable fixture output is committed under `verification/lua/`.

## Exit codes

`0` recognized format · `1` unreadable input · `2` unknown format (report
still emitted).

## Limitations

See the `limitations` array in every JSON report — static byte analysis
only; fingerprint scores are heuristic; string recovery is limited to
escape decoding; network findings are literal-pattern matches, not verified
behavior.
