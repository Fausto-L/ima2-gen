# Bundled MCP tool-contract snapshots

Sanitized tool contracts (`tools/list` mirrors) for official provider MCP servers,
captured through the ima2 schema pipeline (`lib/mcp/snapshotPipeline.ts`).

## What these are

- Interface metadata only: tool names, descriptions, input/output JSON schemas,
  annotations, provenance hashes. The MCP specification treats `tools/list`
  responses as cacheable (including a public cache scope), and MCP registries
  and aggregators republish tool schemas as established ecosystem practice.
- Sanitized: bearer tokens, emails, signed URL parameters, and account data are
  removed before bundling (`lib/mcp/sanitizer.ts`); provenance carries original
  and sanitized content hashes.
- Discovery-only: bundled snapshots load as `documented` catalog entries and are
  never treated as proof of execution rights. Live `tools/list` always takes
  precedence after the user connects their own account via OAuth.

## What these are not

- Not provider code, models, or outputs. Nothing here reproduces provider
  internals — only the public tool interface a connected MCP client sees.
- Not credentials. No tokens or account identifiers are stored in this package.

## Takedown policy

If you represent a provider and want a snapshot removed, open an issue on the
ima2-gen repository or contact the maintainer; the snapshot will be removed from
the next published release. Each release re-checks provider terms before
bundling (see devlog/_plan/260715_subscription-mcp-providers/040).
