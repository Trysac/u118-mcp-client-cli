# Architecture

`@trysac/mcp-client-cli` provides programmatic and CLI access to inspect and test Model Context Protocol (MCP) servers.

## Design

1. **Core API (`src/client.ts`)**:
   - `inspect(client)`: Retrieves server capabilities and counts of tools, resources, and prompts.
   - `callTool(client, name, args, opts)`: Calls a tool, applies timeouts via SDK request options, and sanitises output.
   - `checkServer(client)`: Enforces schema validity, uniqueness, naming conventions, and description presence.

2. **Target Resolution (`src/target.ts`)**:
   - Distinguishes stdio commands (`-- <command> [args...]`) from Streamable HTTP endpoints (`--url <url>`).
   - Strict URL scheme validation restricting to `http:` and `https:`.

3. **Sanitization (`src/sanitizer.ts`)**:
   - Strips C0 and C1 control characters (excluding `\n` and `\t`), preventing terminal escape code injection.
   - Caps output at `maxOutput` and appends a `[truncated <n> chars]` marker.

4. **CLI Runner (`src/cli.ts`)**:
   - Parses commands and options.
   - Accepts injected `connect` hooks for isolated in-memory unit tests.
   - Guarantees client teardown in `finally` blocks.
