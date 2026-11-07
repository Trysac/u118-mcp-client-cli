# @trysac/mcp-client-cli

Command-line MCP client to inspect and smoke-test servers over stdio or Streamable HTTP: list tools, call them with JSON args, check schemas, with timeouts and sanitised output.

## The Problem

Developers building MCP servers test them by wiring a full chat client, which is slow and hides protocol errors behind the model. A scriptable client that lists capabilities, calls a tool with exact arguments and checks definitions makes the server loop fast and usable in CI. This package is that CLI, built on the official TypeScript SDK.

## Installation

```bash
npm install @trysac/mcp-client-cli
```

## Usage

```typescript
import { run } from '@trysac/mcp-client-cli';

const io = {
  stdout: (s: string) => process.stdout.write(s),
  stderr: (s: string) => process.stderr.write(s),
};
const code = await run(['info', '--', 'node', 'server.js'], io);
if (code !== 0) process.exit(code);
```

## Public API

- `run(argv: string[], io: CliIO, deps?: CliDeps): Promise<number>`: Executes the CLI. Returns 0 for success, 1 for findings or domain failures (e.g., tool timeout, error), and 2 for usage, parsing, or I/O errors.
- `inspect(client: Client): Promise<ServerReport>`: Retrieves server metadata and capability counts.
- `callTool(client: Client, name: string, args: unknown, opts: CallToolOptions): Promise<CallToolResult>`: Executes a tool with timeout and output sanitization.
- `checkServer(client: Client): Promise<Finding[]>`: Validates schemas, uniqueness, naming conventions, and descriptions.
- `parseTarget(argv: string[]): Target`: Parses target connection details (`--url` or `-- <cmd>`).
- `CliError`: Error class for operational failures (`INVALID_TARGET`, `INVALID_ARGS`, `TIMEOUT`, `USAGE`).

## Why not MCP Inspector?

The MCP Inspector is a browser-based visual tool. This package is scriptable, designed for CI environments with deterministic exit codes, sanitised console output, and no graphical dependency.

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the threat model.