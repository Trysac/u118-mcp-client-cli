# Use Official MCP TypeScript SDK with Sanitized Terminal Output and Pluggable Connect Transport

Status: accepted (generated, pending human review)

## Context

Developers testing MCP servers require a lightweight, scriptable command-line client to smoke-test tools and validate schemas without launching full AI clients or browsers. Output must be safe for terminal display and CI environments.

## Decision

Implement the client over @modelcontextprotocol/sdk supporting stdio and Streamable HTTP. Strip dangerous C0/C1 control characters from all server outputs, support output size capping, and provide an injectable transport connector for fast, socketless in-memory test coverage.

## Consequences

Tests run deterministically in-memory with high coverage and no subprocess leaks. Output in terminals and CI logs is protected from ANSI escape sequence hijacking.
