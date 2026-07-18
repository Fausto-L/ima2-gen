# `ima2 icon` handoff overview

This document hands off a future `ima2 icon` implementation. It describes the intended product and integration boundaries; it is not a build plan for the current session.

## Purpose and scope

`ima2 icon` generates custom icon artwork through ima2's existing server-backed image generation, then turns the result into reusable local assets. It is intended for branded, illustrative, product-specific, and stylistically consistent icons.

It does not replace general-purpose icon libraries for standard system or interface symbols. Established libraries remain the better choice for common actions such as search, close, navigation, and settings when consistency, accessibility, and familiar semantics matter more than custom artwork.

## Pipeline

The full pipeline is:

1. Generate icon artwork through the ima2 server.
2. Crop or split the generated raster image locally.
3. Remove its background locally when requested.
4. Trace the cleaned PNG to SVG with `vtracer`.
5. Optimize the SVG with `svgo`.
6. Export the SVG directly or optionally convert it to a React component with `svgr`.

The server boundary ends after generation. Crop, background removal, tracing, optimization, and export all run on the user's machine.

## Command surface

- `ima2 icon gen` generates one or more PNG icon variants.
- `ima2 icon trace` converts an existing PNG into SVG.
- `ima2 icon optimize` optimizes an existing SVG.
- `ima2 icon export` converts an SVG into a React component.
- `ima2 icon sheet` generates a grid of related icons and auto-crops it into individual assets.
- `ima2 icon --interactive` runs a guided full-pipeline workflow.

## Intended implementation layout

- `bin/commands/icon.ts` — top-level command dispatch, shared validation, and interactive entrypoint.
- `bin/commands/icon-sub/` — focused implementations for `gen`, `trace`, `optimize`, `export`, `sheet`, and `doctor`.
- `bin/lib/icon-pipeline.ts` — reusable local crop, background-removal, trace, optimize, export, dependency-probe, and manifest orchestration.

Because ima2 ships TypeScript and compiled JavaScript side by side, future implementation must update source and regenerate the corresponding JavaScript through the repository's normal build workflow rather than hand-maintaining divergent copies.

## Existing ima2 integration

The feature should reuse ima2's current generation path instead of introducing a second provider client. Generation resolves and calls the running server through `bin/lib/client.ts`; existing session/history behavior should remain authoritative. Existing argument, output, file I/O, and recovery helpers should be reused where their contracts fit, especially `bin/lib/args.ts`, `bin/lib/output.ts`, `bin/lib/files.ts`, and `bin/lib/recover-output.ts`.

Icon-specific code owns only prompt shaping, pipeline orchestration, dependency checks, asset naming, and `manifest.json`. This keeps authentication, provider selection, server generation, history, recovery, and general file handling consistent with the rest of ima2.
