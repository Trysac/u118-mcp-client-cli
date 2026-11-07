# Testing

Tests are located in `test/` and run via `vitest`. They use injected in-memory transports (`InMemoryTransport.createLinkedPair`) to simulate server communication without real networking or process spawning.

## Covered Areas

- `test/branches.test.ts`: Covers CLI argument parsing errors, target resolution (HTTP/Stdio), inspect/check utility behavior with stubbed clients, and low-level server communication errors.
- `test/cli.test.ts`: Functional end-to-end integration tests for command execution (`tools`, `call`, `info`, `check`) against `McpServer` and `Server` instances.
- `test/errors.test.ts`: Verifies `CliError` behavior, including message truncation.
- `test/index.test.ts`: Confirms public API exports.
- `test/sanitizer.test.ts`: Validates control character removal and truncation logic.
- `test/target.test.ts`: Verifies parsing of `--url` and `-- <cmd> [args]` inputs.