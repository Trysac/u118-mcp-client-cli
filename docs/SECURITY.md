# Security Model

## Defended Threats

- **Terminal Injection**: The `sanitizeControlCharacters` function strips all C0/C1 control characters (excluding tab and newline) from server responses, neutralizing potential escape sequence attacks.
- **Uncontrolled Resource Consumption**: Tool calls are subject to configurable `timeoutMs` and `maxOutput` (defaults: 10,000ms and 100,000 characters). Responses exceeding these limits are truncated.
- **Command Injection**: When using stdio mode (`-- <command>`), arguments are passed directly as a vector to the process execution, bypassing shell interpretation.
- **Credential Leaking**: Stdio transports only expose environment variables explicitly defined by `getDefaultEnvironment()`.

## Not Defended

- Malicious server code executing logic on the host system beyond the transport layer (e.g., if the user manually executes a malicious server binary).
- Denial of Service attacks against the network/host machine itself (CPU/Memory exhaustion) by the server process, beyond the constraints placed on the transport stream.