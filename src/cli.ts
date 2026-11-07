import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { callTool, checkServer, inspect } from "./client.js";
import { CliError } from "./errors.js";
import { DEFAULT_MAX_OUTPUT, sanitizeControlCharacters } from "./sanitizer.js";
import { parseTarget, type Target } from "./target.js";

/**
 * IO channels for the CLI.
 */
export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

/**
 * Optional dependency overrides for testing.
 */
export interface CliDeps {
  connect?: (target: Target) => Promise<Transport>;
}

const USAGE_TEXT = `Usage: mcp-client-cli <command> [options] [--url <url> | -- <command> [args...]]

Commands:
  info               Display server info and capability counts
  tools              List tools
  call <name>        Call a tool with JSON arguments
  resources          List resources
  prompts            List prompts
  check              Validate server tools against quality rules

Options:
  --json             Output in compact JSON format
  --timeout <ms>     Request timeout in milliseconds (default: 10000)
  --max-output <n>   Maximum output characters for tool call results (default: 100000)
  --args <json>      JSON arguments for tool call (default: {})
  --url <url>        HTTP/HTTPS URL of the server
  -- <cmd> [args...] Stdio server command and arguments
`;

/**
 * Default factory to create an MCP transport from a Target.
 */
async function defaultConnect(target: Target): Promise<Transport> {
  if (target.kind === "stdio") {
    return new StdioClientTransport({
      command: target.command,
      args: target.args,
      env: getDefaultEnvironment(),
    });
  }
  return new StreamableHTTPClientTransport(new URL(target.url));
}

interface ParsedOptions {
  command: string;
  toolName?: string | undefined;
  isJson: boolean;
  timeoutMs: number;
  maxOutput: number;
  toolArgs: unknown;
  targetArgv: string[];
}

function parseCliArgs(argv: string[]): ParsedOptions {
  let command = "";
  let toolName: string | undefined;
  let isJson = false;
  let timeoutMs = 10_000;
  let maxOutput = DEFAULT_MAX_OUTPUT;
  let rawArgs: string | undefined;
  const targetArgv: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      targetArgv.push(...argv.slice(i));
      break;
    }
    if (arg === "--url") {
      const val = argv[i + 1];
      if (val === undefined) {
        throw new CliError("INVALID_TARGET", "Missing URL after --url");
      }
      targetArgv.push(arg, val);
      i += 2;
      continue;
    }
    if (arg === "--json") {
      isJson = true;
      i += 1;
      continue;
    }
    if (arg === "--timeout") {
      const val = argv[i + 1];
      if (val === undefined || !/^\d+$/.test(val)) {
        throw new CliError(
          "USAGE",
          "Invalid or missing --timeout value (positive integer required)",
        );
      }
      timeoutMs = Number.parseInt(val, 10);
      i += 2;
      continue;
    }
    if (arg === "--max-output") {
      const val = argv[i + 1];
      if (val === undefined || !/^\d+$/.test(val)) {
        throw new CliError(
          "USAGE",
          "Invalid or missing --max-output value (positive integer required)",
        );
      }
      maxOutput = Number.parseInt(val, 10);
      i += 2;
      continue;
    }
    if (arg === "--args") {
      const val = argv[i + 1];
      if (val === undefined) {
        throw new CliError("INVALID_ARGS", "Missing argument value for --args");
      }
      rawArgs = val;
      i += 2;
      continue;
    }

    if (!arg.startsWith("-")) {
      if (!command) {
        command = arg;
      } else if (command === "call" && !toolName) {
        toolName = arg;
      } else {
        throw new CliError("USAGE", `Unexpected argument: ${arg}`);
      }
      i += 1;
      continue;
    }

    throw new CliError("USAGE", `Unknown option: ${arg}`);
  }

  if (!command) {
    throw new CliError("USAGE", "No command provided");
  }

  let toolArgs: unknown = {};
  if (rawArgs !== undefined) {
    try {
      toolArgs = JSON.parse(rawArgs);
    } catch {
      throw new CliError("INVALID_ARGS", "--args is not valid JSON");
    }
  }

  return {
    command,
    toolName,
    isJson,
    timeoutMs,
    maxOutput,
    toolArgs,
    targetArgv,
  };
}

/**
 * Executes the MCP client CLI command.
 *
 * Exit codes:
 * - 0: Success
 * - 1: Findings or domain failure (e.g. check failures, tool isError true, tool timeout)
 * - 2: Usage error, I/O error, or JSON parse error
 *
 * @param argv - Command-line arguments.
 * @param io - Standard stdout and stderr handlers.
 * @param deps - Injected dependencies such as transport factory for tests.
 * @returns Exit code promise.
 */
export async function run(argv: string[], io: CliIO, deps?: CliDeps): Promise<number> {
  let parsed: ParsedOptions;
  try {
    parsed = parseCliArgs(argv);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof CliError && err.code === "INVALID_ARGS") {
      io.stderr(`error: ${message}\n`);
      return 2;
    }
    io.stderr(`error: ${message}\n${USAGE_TEXT}`);
    return 2;
  }

  const validCommands = new Set(["info", "tools", "call", "resources", "prompts", "check"]);
  if (!validCommands.has(parsed.command)) {
    io.stderr(`error: Unknown command "${parsed.command}"\n${USAGE_TEXT}`);
    return 2;
  }

  // Usage errors are reported before any server is started.
  if (parsed.command === "call" && !parsed.toolName) {
    io.stderr(`error: tool name required for call\n${USAGE_TEXT}`);
    return 2;
  }

  let target: Target;
  try {
    // An injected connect (tests, embedding) needs no --url or "-- command" target.
    target =
      deps?.connect && parsed.targetArgv.length === 0
        ? { kind: "stdio", command: "", args: [] }
        : parseTarget(parsed.targetArgv.length > 0 ? parsed.targetArgv : argv);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`error: ${message}\n`);
    return 2;
  }

  const connectFn = deps?.connect ?? defaultConnect;
  let transport: Transport;
  try {
    transport = await connectFn(target);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`error: failed to connect: ${message}\n`);
    return 2;
  }

  const client = new Client({ name: "mcp-client-cli", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);

    switch (parsed.command) {
      case "info": {
        const report = await inspect(client);
        if (parsed.isJson) {
          io.stdout(`${JSON.stringify(report)}\n`);
        } else {
          io.stdout(
            `Name: ${report.name}\nVersion: ${report.version}\nTools: ${report.tools}\nResources: ${report.resources}\nPrompts: ${report.prompts}\n`,
          );
        }
        return 0;
      }

      case "tools": {
        let toolList: Array<{
          name: string;
          description?: string;
          inputSchema?: { required?: string[] };
        }> = [];
        try {
          const res = await client.listTools();
          if (res && Array.isArray(res.tools)) {
            toolList = res.tools as typeof toolList;
          }
        } catch {
          toolList = [];
        }

        if (parsed.isJson) {
          const jsonTools = toolList.map((t) => ({
            name: sanitizeControlCharacters(t.name),
            description: sanitizeControlCharacters(t.description ?? ""),
            required: Array.isArray(t.inputSchema?.required) ? t.inputSchema.required : [],
          }));
          io.stdout(`${JSON.stringify(jsonTools)}\n`);
        } else {
          for (const t of toolList) {
            const req = Array.isArray(t.inputSchema?.required)
              ? t.inputSchema.required.join(",")
              : "";
            const cleanName = sanitizeControlCharacters(t.name);
            io.stdout(`${cleanName}\t${req}\n`);
          }
        }
        return 0;
      }

      case "call": {
        if (!parsed.toolName) {
          io.stderr(`error: tool name required for call\n${USAGE_TEXT}`);
          return 2;
        }
        try {
          const res = await callTool(client, parsed.toolName, parsed.toolArgs, {
            timeoutMs: parsed.timeoutMs,
            maxOutput: parsed.maxOutput,
          });
          if (parsed.isJson) {
            io.stdout(`${JSON.stringify(res)}\n`);
          } else {
            io.stdout(`${res.text}\n`);
          }
          return res.isError ? 1 : 0;
        } catch (err: unknown) {
          if (err instanceof CliError && err.code === "TIMEOUT") {
            io.stderr(`error: ${err.message}\n`);
            return 1;
          }
          const message = err instanceof Error ? err.message : String(err);
          io.stderr(`error: ${message}\n`);
          return 1;
        }
      }

      case "resources": {
        let resourceList: Array<{ uri: string; name?: string }> = [];
        try {
          const res = await client.listResources();
          if (res && Array.isArray(res.resources)) {
            resourceList = res.resources as typeof resourceList;
          }
        } catch {
          resourceList = [];
        }
        if (parsed.isJson) {
          io.stdout(`${JSON.stringify(resourceList)}\n`);
        } else {
          for (const r of resourceList) {
            io.stdout(`${r.uri}\t${r.name ?? ""}\n`);
          }
        }
        return 0;
      }

      case "prompts": {
        let promptList: Array<{ name: string; description?: string }> = [];
        try {
          const res = await client.listPrompts();
          if (res && Array.isArray(res.prompts)) {
            promptList = res.prompts as typeof promptList;
          }
        } catch {
          promptList = [];
        }
        if (parsed.isJson) {
          io.stdout(`${JSON.stringify(promptList)}\n`);
        } else {
          for (const p of promptList) {
            io.stdout(`${p.name}\t${p.description ?? ""}\n`);
          }
        }
        return 0;
      }

      case "check": {
        const findings = await checkServer(client);
        const hasErrors = findings.some((f) => f.severity === "error");
        if (findings.length === 0) {
          io.stdout("ok\n");
          return 0;
        }
        for (const f of findings) {
          io.stdout(`${f.severity} ${f.code} tool=${f.tool}\n`);
        }
        return hasErrors ? 1 : 0;
      }

      default:
        io.stderr(`error: Unknown command\n${USAGE_TEXT}`);
        return 2;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`error: ${message}\n`);
    return 2;
  } finally {
    try {
      await client.close();
    } catch {
      // Client close errors suppressed on exit
    }
  }
}
