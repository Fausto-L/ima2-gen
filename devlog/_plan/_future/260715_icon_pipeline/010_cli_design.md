# `ima2 icon` CLI design specification

This is the command contract for a future implementation of the icon pipeline.

## Commands

```text
ima2 icon gen <prompt>     — Generate icon artwork via server, save as PNG
  --style flat|duotone|3d-soft|outline  (default: flat)
  --palette <hex,hex,...>   — Color palette constraint
  --size <WxH>              — Output size (default: 256x256)
  --count <N>               — Number of variants (default: 1)
  --ref <file>              — Style reference image
  --out <file>              — Output path
  --out-dir <dir>           — Output directory for batch

ima2 icon trace <input>    — Trace PNG to SVG using vtracer
  --colormode color|bw      (default: color)
  --detail low|medium|high  (default: medium)
  --out <file>

ima2 icon optimize <input.svg>  — Optimize SVG with svgo
  --out <file>

ima2 icon export <input.svg>    — Convert SVG to React component with svgr
  --out <file>
  --component-name <Name>

ima2 icon sheet <prompt>   — Generate icon sheet (multiple icons in grid) + auto-crop
  --icons <name1,name2,...>  — Icon names/concepts
  --grid <cols>x<rows>       — Grid layout (default: auto)
  --style, --palette, --ref  — Same as gen

ima2 icon --interactive    — Full pipeline wizard
```

`--out` is for a single explicit result. `--out-dir` is the batch destination for multiple variants or split sheet assets; using both should be rejected with a clear usage error. `--count` must be a positive integer. Dimensions, grid values, palette entries, input extensions, and component names should be validated before work begins.

## Generation behavior

`gen` and `sheet` reuse `resolveServer` and `request` from `bin/lib/client.ts`. They should follow the same server discovery, authentication, request normalization, status output, session/history, file persistence, and recovery conventions as the existing generation command. Icon options shape the generation prompt and output organization; they do not call image providers directly.

The server interaction boundary is explicit:

- Server-side: image generation only, including use of the optional `--ref` image through the existing generation request contract.
- Local: crop, sheet splitting, background removal, tracing, SVG optimization, React export, dependency probing, naming, and manifest updates.

A server failure must use the existing CLI error conventions and must not start local post-processing. A local post-processing failure should retain every successfully produced earlier artifact and record the failed stage in the manifest so the command can be resumed manually.

## Output structure and manifest

The default root is:

```text
~/.ima2/generated/icons/<session>/
├── manifest.json
├── png/
├── svg/
└── react/
```

`<session>` should be a filesystem-safe timestamp or existing ima2 session identifier. Explicit `--out` and `--out-dir` override asset destinations, but a manifest should still be written beside the output set when the operation creates multiple stages or files.

`manifest.json` should be append-safe and include at least:

- schema version, session ID, creation/update timestamps, and command invocation;
- original prompt, icon names, style, palette, size, grid, and reference-image path or digest;
- generated asset records with stable IDs and source-to-derived-file relationships;
- stage status for generation, crop, background removal, trace, optimize, and export;
- tool/version probes and actionable errors for skipped or failed local stages;
- relevant existing ima2 request/session/history identifiers.

Paths should be stored relative to the manifest directory when possible so a session folder remains portable.

## Interactive workflow

`ima2 icon --interactive` runs this wizard:

1. Choose a style: `flat`, `duotone`, `3d-soft`, or `outline`.
2. Set an optional palette.
3. Enter the icon list.
4. Generate an anchor icon and present its saved path for approval.
5. Batch-generate the remaining icons using the approved anchor as `--ref`.
6. Auto-trace and optimize the results, then optionally export React components.

The wizard should probe all local dependencies before generation and explain which later stages will be unavailable. Declining the anchor should allow regeneration or cancellation without generating the remaining batch. Non-interactive subcommands remain independently usable for scripting and recovery.

## Errors and degradation

Validation errors exit before server or tool calls. Missing input files, unsupported extensions, malformed colors/sizes/grids, output collisions, and invalid names should identify the offending value and show corrected syntax.

If `vtracer` is unavailable, tracing must fail gracefully without deleting or hiding the PNG. The error should include the installation command:

```text
vtracer is required to trace PNG files to SVG.
Install it with: cargo install vtracer
Your PNG output has been kept at: <path>
```

Equivalent stage-specific errors should preserve prior outputs. Optional React export should be reported as skipped when `svgr` is unavailable unless the user explicitly invoked `ima2 icon export`, in which case the command should exit non-zero with installation guidance.
