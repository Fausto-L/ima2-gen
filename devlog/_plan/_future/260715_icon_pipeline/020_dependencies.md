# `ima2 icon` dependency integration specification

The pipeline should probe external tools before generation, report exact capabilities, and preserve the latest usable artifact when an optional local stage is unavailable.

## Dependency matrix

### `vtracer` — required for tracing

`vtracer` is a Rust command-line binary used by `ima2 icon trace` and the trace stage of the full pipeline.

- Install: `cargo install vtracer`
- Probe: resolve `vtracer` on `PATH` using the platform-appropriate equivalent of `which vtracer`, then run a lightweight version/help check.
- Required behavior: an explicit `trace` command exits non-zero with the install command when unavailable.
- Graceful degradation: `gen`, `sheet`, and the interactive pipeline keep their PNG outputs, mark tracing as skipped in `manifest.json`, and continue only with stages that do not require SVG.

### `svgo` — required for optimization

`svgo` optimizes traced or user-supplied SVG files.

- Integration: add `svgo` to `devDependencies` for a pinned project-known version, or invoke it through `npx` when package policy favors on-demand tooling.
- Probe: `npx svgo --version` without installation prompts; implementation should avoid silently downloading a package during a capability check.
- Required behavior: an explicit `optimize` command exits non-zero with installation guidance when unavailable.
- Graceful degradation: preserve the unoptimized SVG and mark optimization as skipped.

The preferred implementation is a pinned project dependency so builds and generated output are reproducible. `npx` remains the command boundary and fallback strategy if that matches existing package conventions.

### `svgr` — optional for React export

`@svgr/cli` converts an optimized SVG into a React component.

- Invoke: `npx @svgr/cli <input.svg> --out-file <output>` plus the selected component-name option.
- Probe: check whether the local package/CLI can run in no-install mode and obtain its version.
- Optional behavior: normal PNG/SVG pipelines do not fail when `svgr` is missing.
- Explicit export behavior: `ima2 icon export` exits non-zero with an install command or package guidance if unavailable.

### `sharp` — crop and resize

`sharp` is the preferred Node-native implementation for deterministic crop, resize, and sheet splitting. Before adding it, confirm whether the repository already supplies it transitively or whether `bin/lib/files.ts` exposes suitable image helpers.

- Prefer existing `bin/lib/files.ts` helpers when they cover the required pixel operations and error handling.
- Otherwise add `sharp` as a direct runtime dependency, because these operations execute on end-user machines.
- Probe by loading the installed module and reporting its version/capabilities through `doctor`.
- A missing crop backend blocks `sheet` auto-crop but should not discard the generated sheet PNG.

### `rembg` or equivalent — background removal

Background removal may use the Python `rembg` CLI or a later equivalent local/API-backed implementation.

- Install/probe contract for the initial CLI option: locate `rembg` using the platform-appropriate equivalent of `which rembg`, then run a version/help check.
- Treat background removal as optional unless a command explicitly requests it.
- If unavailable, preserve the uncropped/opaque PNG, mark the stage as skipped, and provide a manual masking hint rather than pretending the background was removed.
- Any future API fallback must be explicit because it changes the local-only post-processing boundary and may upload user assets.

## Probe before generation

The top-level pipeline should probe every dependency needed by the requested stages before contacting the generation server. This prevents users from spending generation time or quota before learning that the desired output format cannot be produced.

Add `ima2 icon doctor` as the reusable probe command. It should report:

```text
generation server   reachable|unreachable   <url or guidance>
crop backend        available|missing       <sharp/files helper version>
background removal  available|optional      <rembg version or hint>
vtracer             available|missing       <version and cargo install command>
svgo                 available|missing       <version and npm install guidance>
svgr                 available|optional      <version and npm install guidance>
```

`doctor` itself should not install tools. The pipeline may proceed after warnings when the requested terminal artifact remains achievable; it should require confirmation in interactive mode and emit clear skipped-stage records in non-interactive mode.

## Package and system dependency changes

Future implementation should update `package.json` as follows:

- Add `svgo` as a pinned `devDependency` unless repository packaging analysis shows the CLI needs it as a runtime dependency in published installs.
- Add `sharp` only if existing dependencies and `bin/lib/files.ts` cannot provide crop/resize; if end users execute it, declare it in runtime dependencies rather than only `devDependencies`.
- Add `@svgr/cli` only if bundled React export is chosen; otherwise document the on-demand/local install contract.

Document `cargo`/`vtracer` and Python/`rembg` as optional system dependencies. Installation documentation should distinguish stage requirements: PNG generation works without them, tracing requires `vtracer`, optimization requires `svgo`, and React export requires `svgr`.

All probes and subprocess calls should use argument-array execution rather than shell interpolation, capture stdout/stderr for actionable diagnostics, and record detected versions in `manifest.json`.
