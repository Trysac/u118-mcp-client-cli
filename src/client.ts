import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { z } from "zod";
import { CliError } from "./errors.js";
import { sanitizeAndTruncate } from "./sanitizer.js";

/**
 * Report describing the MCP server metadata and counts.
 */
export interface ServerReport {
  name: string;
  version: string;
  capabilities: Record<string, unknown>;
  tools: number;
  resources: number;
  prompts: number;
}

/**
 * Validation finding produced by `checkServer`.
 */
export interface Finding {
  severity: "error" | "warning";
  code: "schema_not_object" | "duplicate_tool_name" | "missing_description" | "invalid_tool_name";
  tool: string;
}

/**
 * Options for calling an MCP tool.
 */
export interface CallToolOptions {
  timeoutMs: number;
  maxOutput: number;
}

/**
 * Result of a tool execution.
 */
export interface CallToolResult {
  text: string;
  isError: boolean;
}

const TOOL_NAME_REGEX = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * Inspects an active MCP server connection and returns summary counts.
 *
 * @param client - Initialized MCP client.
 * @returns ServerReport metadata and feature counts.
 */
export async function inspect(client: Client): Promise<ServerReport> {
  const serverVersion = client.getServerVersion() ?? { name: "unknown", version: "unknown" };
  const capabilities =
    (client.getServerCapabilities() as Record<string, unknown> | undefined) ?? {};

  let toolsCount = 0;
  let resourcesCount = 0;
  let promptsCount = 0;

  try {
    const toolsResp = await client.listTools();
    if (toolsResp && Array.isArray(toolsResp.tools)) {
      toolsCount = toolsResp.tools.length;
    }
  } catch {
    toolsCount = 0;
  }

  try {
    const resourcesResp = await client.listResources();
    if (resourcesResp && Array.isArray(resourcesResp.resources)) {
      resourcesCount = resourcesResp.resources.length;
    }
  } catch {
    resourcesCount = 0;
  }

  try {
    const promptsResp = await client.listPrompts();
    if (promptsResp && Array.isArray(promptsResp.prompts)) {
      promptsCount = promptsResp.prompts.length;
    }
  } catch {
    promptsCount = 0;
  }

  return {
    name: serverVersion.name,
    version: serverVersion.version,
    capabilities,
    tools: toolsCount,
    resources: resourcesCount,
    prompts: promptsCount,
  };
}

/**
 * Executes a tool on the server with timeout control and sanitised output.
 *
 * @param client - Initialized MCP client.
 * @param name - Name of the tool to execute.
 * @param args - Arguments to pass to the tool (plain JS object).
 * @param opts - Execution options (timeout in ms and max output characters).
 * @returns The sanitised output text and error status.
 */
export async function callTool(
  client: Client,
  name: string,
  args: unknown,
  opts: CallToolOptions,
): Promise<CallToolResult> {
  const toolArgs =
    typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
  try {
    const result = await client.callTool(
      {
        name,
        arguments: toolArgs,
      },
      undefined,
      { timeout: opts.timeoutMs },
    );

    const contents: string[] = [];
    const rawContentList = result && Array.isArray(result.content) ? result.content : [];
    for (const item of rawContentList) {
      if (typeof item === "object" && item !== null) {
        const contentObj = item as Record<string, unknown>;
        if (contentObj.type === "text" && typeof contentObj.text === "string") {
          contents.push(contentObj.text);
        } else {
          const typeName = typeof contentObj.type === "string" ? contentObj.type : "unknown";
          contents.push(`[${typeName} content]`);
        }
      } else if (typeof item === "string") {
        contents.push(item);
      }
    }

    const combined = contents.join("\n");
    const sanitized = sanitizeAndTruncate(combined, opts.maxOutput);
    const isError = Boolean((result as { isError?: boolean } | undefined)?.isError);
    return {
      text: sanitized,
      isError,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("timeout") || message.toLowerCase().includes("timed out")) {
      throw new CliError("TIMEOUT", `timeout after ${opts.timeoutMs} ms`);
    }
    throw error;
  }
}

/**
 * Checks the server's tool schemas against quality and validation rules.
 *
 * Rules:
 * - inputSchema must be an object with type 'object' (error: schema_not_object)
 * - Tool names must be unique (error: duplicate_tool_name)
 * - Tool names must match ^[A-Za-z0-9_.-]{1,128}$ (error: invalid_tool_name)
 * - Tool descriptions must be present and non-empty (warning: missing_description)
 *
 * @param client - Initialized MCP client.
 * @returns Array of validation findings.
 */
export async function checkServer(client: Client): Promise<Finding[]> {
  const findings: Finding[] = [];
  let toolsList: Array<{
    name?: unknown;
    description?: unknown;
    inputSchema?: unknown;
  }> = [];

  try {
    // A raw request with a lenient schema: listTools() rejects the whole reply when one tool is malformed,
    // and malformed tools are exactly what check must report.
    const res = await client.request(
      { method: "tools/list" },
      z.object({ tools: z.array(z.record(z.string(), z.unknown())) }).passthrough(),
    );
    if (res && Array.isArray(res.tools)) {
      toolsList = res.tools;
    }
  } catch {
    return findings;
  }

  const seenNames = new Set<string>();

  for (const tool of toolsList) {
    const name = typeof tool.name === "string" ? tool.name : "";

    // Check duplicate tool name
    if (seenNames.has(name)) {
      findings.push({
        severity: "error",
        code: "duplicate_tool_name",
        tool: name,
      });
    } else {
      seenNames.add(name);
    }

    // Check valid tool name
    if (!TOOL_NAME_REGEX.test(name)) {
      findings.push({
        severity: "error",
        code: "invalid_tool_name",
        tool: name,
      });
    }

    // Check inputSchema
    const schema = tool.inputSchema;
    if (
      typeof schema !== "object" ||
      schema === null ||
      (schema as Record<string, unknown>).type !== "object"
    ) {
      findings.push({
        severity: "error",
        code: "schema_not_object",
        tool: name,
      });
    }

    // Check description
    const desc = tool.description;
    if (typeof desc !== "string" || desc.trim() === "") {
      findings.push({
        severity: "warning",
        code: "missing_description",
        tool: name,
      });
    }
  }

  return findings;
}
