import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { CliError, callTool, checkServer, inspect, run, type Target } from "../src/index.js";

function makeIo() {
  let out = "";
  let err = "";
  return {
    stdout: (s: string) => {
      out += s;
    },
    stderr: (s: string) => {
      err += s;
    },
    getStdout: () => out,
    getStderr: () => err,
  };
}

async function connectServer(server: Server): Promise<Transport> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  return clientTransport;
}

function fakeClient(impl: Record<string, unknown>): Client {
  return impl as unknown as Client;
}

describe("run argument parsing errors", () => {
  it("returns 2 with usage when --url has no value", async () => {
    const io = makeIo();
    expect(await run(["info", "--url"], io)).toBe(2);
    expect(io.getStderr()).toContain("error: Missing URL after --url");
    expect(io.getStderr()).toContain("Usage: mcp-client-cli");
  });

  it("returns 2 without usage when --args has no value", async () => {
    const io = makeIo();
    expect(await run(["call", "echo", "--args"], io)).toBe(2);
    expect(io.getStderr()).toBe("error: Missing argument value for --args\n");
  });

  it("returns 2 with usage for an unknown option", async () => {
    const io = makeIo();
    expect(await run(["tools", "--verbose"], io)).toBe(2);
    expect(io.getStderr()).toContain("error: Unknown option: --verbose");
    expect(io.getStderr()).toContain("Usage: mcp-client-cli");
  });

  it("returns 2 for an unexpected extra positional argument", async () => {
    const io1 = makeIo();
    expect(await run(["tools", "extra"], io1)).toBe(2);
    expect(io1.getStderr()).toContain("error: Unexpected argument: extra");

    const io2 = makeIo();
    expect(await run(["call", "a", "b"], io2)).toBe(2);
    expect(io2.getStderr()).toContain("error: Unexpected argument: b");
  });

  it("returns 2 when no command is given", async () => {
    const io = makeIo();
    expect(await run([], io)).toBe(2);
    expect(io.getStderr()).toContain("error: No command provided");
  });

  it("returns 2 when --timeout or --max-output has no value", async () => {
    const io1 = makeIo();
    expect(await run(["info", "--timeout"], io1)).toBe(2);
    expect(io1.getStderr()).toContain("Invalid or missing --timeout value");

    const io2 = makeIo();
    expect(await run(["info", "--max-output"], io2)).toBe(2);
    expect(io2.getStderr()).toContain("Invalid or missing --max-output value");
  });
});

describe("run target resolution", () => {
  it("returns 2 when no target is given and no connect is injected", async () => {
    const io = makeIo();
    expect(await run(["tools"], io)).toBe(2);
    expect(io.getStderr()).toBe(
      "error: No target server specified. Provide either --url <url> or -- <command> [args...]\n",
    );
  });

  it("returns 2 for an unsupported URL protocol even with an injected connect", async () => {
    const io = makeIo();
    let called = false;
    const code = await run(["tools", "--url", "ftp://example.com"], io, {
      connect: async () => {
        called = true;
        throw new Error("should not connect");
      },
    });
    expect(code).toBe(2);
    expect(called).toBe(false);
    expect(io.getStderr()).toContain('Unsupported protocol "ftp:"');
  });

  it("passes a parsed stdio target and a parsed http target to the injected connect", async () => {
    const seen: Target[] = [];
    const connect = async (t: Target): Promise<Transport> => {
      seen.push(t);
      throw "refused";
    };

    const io1 = makeIo();
    expect(await run(["tools", "--", "node", "srv.js", "--flag"], io1, { connect })).toBe(2);
    expect(io1.getStderr()).toBe("error: failed to connect: refused\n");

    const io2 = makeIo();
    expect(await run(["tools", "--url", "http://localhost:1234/mcp"], io2, { connect })).toBe(2);

    expect(seen).toEqual([
      { kind: "stdio", command: "node", args: ["srv.js", "--flag"] },
      { kind: "http", url: "http://localhost:1234/mcp" },
    ]);
  });

  it("returns 2 with the error message when the MCP handshake fails, suppressing close errors", async () => {
    const transport: Transport = {
      start: async () => {
        throw new Error("start failed");
      },
      send: async () => {},
      close: async () => {
        throw new Error("close failed");
      },
    };
    const io = makeIo();
    expect(await run(["info"], io, { connect: async () => transport })).toBe(2);
    expect(io.getStderr()).toBe("error: start failed\n");
  });
});

describe("run commands against low-level servers", () => {
  it("tools prints empty description and no required fields when the schema has none", async () => {
    const server = new Server({ name: "s", version: "1" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{ name: "bare\u0007", inputSchema: { type: "object" } }],
    }));

    const io1 = makeIo();
    expect(await run(["tools", "--json"], io1, { connect: () => connectServer(server) })).toBe(0);
    expect(io1.getStdout()).toBe('[{"name":"bare","description":"","required":[]}]\n');

    const io2 = makeIo();
    expect(await run(["tools"], io2, { connect: () => connectServer(server) })).toBe(0);
    expect(io2.getStdout()).toBe("bare\t\n");
    await server.close();
  });

  it("prompts in text mode prints an empty description column when absent", async () => {
    const server = new Server({ name: "s", version: "1" }, { capabilities: { prompts: {} } });
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [{ name: "plain" }],
    }));
    const io = makeIo();
    expect(await run(["prompts"], io, { connect: () => connectServer(server) })).toBe(0);
    expect(io.getStdout()).toBe("plain\t\n");
    await server.close();
  });

  it("check prints only warnings and returns 0 when no errors are found", async () => {
    const server = new Server({ name: "s", version: "1" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{ name: "quiet", description: "   ", inputSchema: { type: "object" } }],
    }));
    const io = makeIo();
    expect(await run(["check"], io, { connect: () => connectServer(server) })).toBe(0);
    expect(io.getStdout()).toBe("warning missing_description tool=quiet\n");
    await server.close();
  });

  it("call returns 1 with the server error message when the tool handler throws", async () => {
    const server = new Server({ name: "s", version: "1" }, { capabilities: { tools: {} } });
    server.setRequestHandler(CallToolRequestSchema, async () => {
      throw new Error("kaboom");
    });
    const io = makeIo();
    expect(await run(["call", "x"], io, { connect: () => connectServer(server) })).toBe(1);
    expect(io.getStderr()).toContain("kaboom");
    expect(io.getStderr().startsWith("error: ")).toBe(true);
    await server.close();
  });

  it("call sends {} as arguments when --args is a non-object JSON value", async () => {
    const server = new Server({ name: "s", version: "1" }, { capabilities: { tools: {} } });
    server.setRequestHandler(CallToolRequestSchema, async (req) => ({
      content: [{ type: "text", text: JSON.stringify(req.params.arguments) }],
    }));
    const io = makeIo();
    const code = await run(["call", "x", "--args", "5", "--max-output", "0"], io, {
      connect: () => connectServer(server),
    });
    expect(code).toBe(0);
    expect(io.getStdout()).toBe("\n[truncated 2 chars]\n");
    await server.close();
  });
});

describe("callTool with a stub client", () => {
  const opts = { timeoutMs: 50, maxOutput: 1000 };

  it("renders string items, unknown types and non-string text, skipping non-objects", async () => {
    const client = fakeClient({
      callTool: async () => ({
        content: ["raw", 42, null, { type: 7 }, { type: "text", text: 3 }],
      }),
    });
    const res = await callTool(client, "t", null, opts);
    expect(res).toEqual({ text: "raw\n[unknown content]\n[text content]", isError: false });
  });

  it("returns empty text when the result has no content array", async () => {
    const client = fakeClient({ callTool: async () => undefined });
    expect(await callTool(client, "t", {}, opts)).toEqual({ text: "", isError: false });
  });

  it("maps 'timed out' errors to CliError TIMEOUT", async () => {
    const client = fakeClient({
      callTool: async () => {
        throw new Error("Request timed out");
      },
    });
    const err = await callTool(client, "t", {}, opts).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).code).toBe("TIMEOUT");
    expect((err as CliError).message).toBe("timeout after 50 ms");
  });

  it("rethrows non-timeout and non-Error failures unchanged", async () => {
    const client = fakeClient({
      callTool: async () => {
        throw "plain failure";
      },
    });
    await expect(callTool(client, "t", {}, opts)).rejects.toBe("plain failure");
  });

  it("run maps a server error mentioning timeout to exit 1 with the timeout message", async () => {
    const server = new Server({ name: "s", version: "1" }, { capabilities: { tools: {} } });
    server.setRequestHandler(CallToolRequestSchema, async () => {
      throw new Error("Operation timeout reached");
    });
    const io = makeIo();
    const code = await run(["call", "x", "--timeout", "5000"], io, {
      connect: () => connectServer(server),
    });
    expect(code).toBe(1);
    expect(io.getStderr()).toBe("error: timeout after 5000 ms\n");
    await server.close();
  });
});

describe("inspect and checkServer with stub clients", () => {
  it("inspect falls back to 'unknown' metadata and zero counts on failures", async () => {
    const client = fakeClient({
      getServerVersion: () => undefined,
      getServerCapabilities: () => undefined,
      listTools: async () => {
        throw new Error("no tools");
      },
      listResources: async () => ({}),
      listPrompts: async () => {
        throw new Error("no prompts");
      },
    });
    expect(await inspect(client)).toEqual({
      name: "unknown",
      version: "unknown",
      capabilities: {},
      tools: 0,
      resources: 0,
      prompts: 0,
    });
  });

  it("inspect ignores replies without arrays", async () => {
    const client = fakeClient({
      getServerVersion: () => ({ name: "n", version: "v" }),
      getServerCapabilities: () => ({ tools: {} }),
      listTools: async () => ({}),
      listResources: async () => {
        throw new Error("x");
      },
      listPrompts: async () => ({}),
    });
    const report = await inspect(client);
    expect(report).toMatchObject({ name: "n", version: "v", tools: 0, resources: 0, prompts: 0 });
  });

  it("checkServer returns no findings when tools/list fails", async () => {
    const client = fakeClient({
      request: async () => {
        throw new Error("method not found");
      },
    });
    expect(await checkServer(client)).toEqual([]);
  });

  it("checkServer returns no findings when the reply has no tools array", async () => {
    const client = fakeClient({ request: async () => ({}) });
    expect(await checkServer(client)).toEqual([]);
  });

  it("checkServer reports a nameless tool with null schema and non-string description", async () => {
    const client = fakeClient({
      request: async () => ({ tools: [{ name: 5, description: 1, inputSchema: null }] }),
    });
    expect(await checkServer(client)).toEqual([
      { severity: "error", code: "invalid_tool_name", tool: "" },
      { severity: "error", code: "schema_not_object", tool: "" },
      { severity: "warning", code: "missing_description", tool: "" },
    ]);
  });

  it("checkServer flags a non-object schema primitive", async () => {
    const client = fakeClient({
      request: async () => ({ tools: [{ name: "ok", description: "d", inputSchema: "x" }] }),
    });
    expect(await checkServer(client)).toEqual([
      { severity: "error", code: "schema_not_object", tool: "ok" },
    ]);
  });
});
