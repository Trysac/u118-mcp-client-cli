# Project record: mcp-client-cli

## Objective

Command-line MCP client to inspect and smoke-test servers over stdio or Streamable HTTP: list tools, call them with JSON args, check schemas, with timeouts and sanitised output.

## Scope

- Inspection of MCP server capabilities and metadata.
- Execution of tools with JSON arguments, configurable timeouts, and output limits.
- Automated schema and convention validation (`checkServer`).
- Transport support for Stdio and Streamable HTTP.
- Sanitization of server responses against control character injection and size limits.

## Out of Scope

- OAuth flows.
- Sampling and elicitation handlers.
- Interactive REPL.
- SSE (Server-Sent Events) legacy transport.

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created. |

## Effort metrics

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 3185279 / 20062 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 0.5053 | factory ledger |

## Factory run u118 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | gemini-3.8-flash | yes | 4640 | 15542 | 0 | 0 | 0.0309 |
| fix-1 | gemini-3.8-flash | no | 77016 | 999 | 0 | 595485 | 0.1062 |
| fix-2 | gemini-3.8-flash | no | 17564 | 177 | 0 | 13289 | 0.0148 |
| fix-3 | gemini-3.8-flash | no | 99707 | 909 | 0 | 1037407 | 0.1560 |
| fix-4 | gemini-3.8-flash | no | 125836 | 899 | 0 | 1133995 | 0.1828 |
| audit | gemini-3.1-flash-lite | no | 23581 | 130 | 0 | 34528 | 0.0070 |
| docs | gemini-3.1-flash-lite | no | 22231 | 1406 | 0 | 0 | 0.0077 |

Total: $0.5053. Prices: Anthropic list prices.
