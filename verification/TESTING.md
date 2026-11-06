# Test evidence — sudodc2/rea build

All results below were produced on this machine against this checkout.
Environment: Windows 11 x64, Node.js v24.22.1, git 2.51.0 (MinGit).
Nothing here claims coverage that was not executed; unavailable providers
are listed as unavailable, not skipped silently.

## 1. Source build

| Step               | Command                                        | Result                                                                                                                                                      |
| ------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency install | `npm install` (Node v24.22.1, `.nvmrc`-pinned) | pass — full workspace install                                                                                                                               |
| TypeScript compile | `npm run compile`                              | pass — `tsc -p tsconfig.build.json` clean; only benign `INEFFECTIVE_DYNAMIC_IMPORT` bundler notes                                                           |
| CLI smoke          | `node tooling/rea.mjs doctor`                  | runs; `healthy: false` solely due to bring-your-own providers (Ghidra/IDA/Hopper/Kuna/JADX unset) and MCP client registrations — expected on a bare machine |

The full `npm run build` lane additionally requires the packaged Windows
native artifact (`platform/windows/build/`). It is restored from the published
`rea-agents@6.8.0` npm tarball per `platform/windows/README.md` (version-pinned,
SHA-256 verified by the loader). It is gitignored and not committed.

## 2. Unit / domain test suite

| Command                       | Result                                              |
| ----------------------------- | --------------------------------------------------- |
| `vitest run --project domain` | **477 test files, 10,047 tests — all passed** (59s) |

## 3. Real-provider-free command checks (live CLI)

| Command                          | Target                         | Result                                                                                                                             |
| -------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `inspect-pe-resources`           | `C:\Windows\System32\curl.exe` | pass — Evidence record `ev_9791ab81…`, PE32+ inventory, sha256 `73d24149…`, 2 resources, coverage `complete`, limitations recorded |
| `doctor`                         | —                              | pass (runs; provider gaps reported as designed)                                                                                    |
| `analyze-javascript-application` | directory of 18 JS/HTML files  | **see §5**                                                                                                                         |

## 4. rea-lua — Luau/Lua artifact analyzer (new in this repo)

`lua/rea-lua.mjs` adds the Lua coverage upstream REA does not have:
format fingerprinting (VX / Luraph / MoonVeil / IronBrew / PSU / bytecode /
plain), entropy + base85-density metrics, long-string payload accounting,
executor-API probe inventory, suspicious-global detection, network surface
(discord webhooks, URLs, `game:HttpGet`, `loadstring`-remote), and
escape-decoded string recovery. Static only — the artifact is never executed.

Fixture suite (`lua/tests/run.mjs`, fixtures in `lua/tests/fixtures/`):

| Fixture                                        | Expected        | Got                | Notes                                                                 |
| ---------------------------------------------- | --------------- | ------------------ | --------------------------------------------------------------------- |
| `plain.lua`                                    | `luau-plain`    | `luau-plain`       | pass                                                                  |
| `luraph-marker.lua`                            | `luraph`        | `luraph`           | pass — LPH markers + env probes detected                              |
| `webhook.lua`                                  | `luau-plain`    | `luau-plain`       | pass — `discord-webhook`, `http-url`, `game-httpget` surface reported |
| `malformed.lua` (ESC-Lua header + random tail) | `luau-bytecode` | `luau-bytecode`    | pass                                                                  |
| `garbage.bin` (random bytes)                   | `unknown`       | `unknown` (exit 2) | pass                                                                  |

Machine-readable reports for every fixture: `verification/lua/*.json`.

Real-artifact spot checks (not committed — targets live outside the repo):

- VX-obfuscated benchmark output (~367–390 KB each): fingerprinted as
  Luraph-family loader idioms, entropy ≈5.5–5.7 bits/byte, base85 density
  ≈0.78, single multi-hundred-KB long-string payload block, `getfenv` probe
  detected, zero suspicious globals, no literal network surface.
- `ZLK_NEW.lua` (425,504 bytes, VX build): Luraph-family fingerprint,
  6 long-string blocks totaling 200,430 bytes, 202 function definitions,
  `getfenv` env probe, no plaintext URLs or webhooks.

## 5. Known issue found during verification

`analyze-javascript-application` fails at the `source-transfer` phase with
`Unknown native filesystem operation (Win32 87)` **only on the source-built
dist** (`npm run compile` output). Isolation performed:

- Reproduces with and without spaces in target path, and from a neutral CWD.
- Failure is inside `writeJavaScriptAnalysisSourceTransfer` →
  `windowsPrivateRuntime(...).writeTransientFile` (native addon call).
- The official `rea-agents@6.8.0` **published npm package completes the same
  command** on the same target and emits a full ~140 MB Evidence record —
  so this is a source-build packaging defect, not a 6.8.0 regression and not
  a target problem.
- `rea-agents@6.7.0` published package also completes (~132 MB Evidence).
- Everything else on the source build (doctor, PE resource inspection,
  10,047 domain tests) works.

Root cause identified: the published `rea-agents@6.8.0` npm tarball's `dist/`
predates the `runtime_write_transient` private-runtime call present in this
source tree — the GitHub source is ahead of the npm release and its Windows
native addon has not been published yet (latest npm is still 6.8.0). The
addon's loader verifies package version/ABI/digest only, so the stale native
accepts the load but returns `Win32 87` on the new op. This is upstream
release skew, not a defect introduced here; it affects only source builds on
Windows for this one command. The published package and 6.7.0 both complete
the same analysis (~132–140 MB Evidence). Building the addon requires the
Linux/MinGW lane in `platform/windows/README.md`.

## 6. Not exercised (honest gaps)

- Ghidra / IDA / Hopper / Kuna / JADX provider-backed analysis — no
  providers installed on this machine; `doctor` reports them unconfigured.
- `inspect-binary-layout` (pwntools profile) — Linux x64 only by design.
- MCP server mode, browser/Electron capture, Frida instrumentation —
  require additional setup not present here.
- The JS-application failure in §5 is unresolved on this checkout.
