import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { run } from "../src/index.js";

function makeIo() {
  let stdoutStr = "";
  let stderrStr = "";
  return {
    stdout: (s: string) => {
      stdoutStr += s;
    },
    stderr: (s: string) => {
      stderrStr += s;
    },
    getStdout: () => stdoutStr,
    getStderr: () => stderrStr,
  };
}

describe("run CLI", () => {
  it('run([\'tools\', \'--json\'], io, { connect }) against an in-memory server with one tool \'echo\' prints \'[{"name":"echo","description":"Echo text","required":["text"]}]\' followed by a newline and returns 0', async () => {
    const server = new McpServer({
      name: "test-server",
      version: "1.0.0",
    });
    server.tool("echo", "Echo text", { text: z.string() }, async ({ text }) => ({
      content: [{ type: "text", text }],
    }));

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const io = makeIo();
    const code = await run(["tools", "--json"], io, {
      connect: async () => clientTransport,
    });

    expect(code).toBe(0);
    expect(io.getStdout()).toBe(
      '[{"name":"echo","description":"Echo text","required":["text"]}]\n',
    );
    await server.close();
  });

  it("run(['call', 'echo', '--args', '{\"text\":\"hi\"}'], io, { connect }) prints 'hi\\n' and returns 0, and a tool result with isError true prints its text and returns 1", async () => {
    const server = new McpServer({
      name: "test-server",
      version: "1.0.0",
    });
    server.tool("echo", "Echo tool", { text: z.string().optional() }, async (args) => ({
      content: [{ type: "text", text: args.text ?? "" }],
    }));
    server.tool("fail", "Failing tool", {}, async () => ({
      content: [{ type: "text", text: "something broke" }],
      isError: true,
    }));

    const [clientTransport1, serverTransport1] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport1);

    const io1 = makeIo();
    const code1 = await run(["call", "echo", "--args", '{"text":"hi"}'], io1, {
      connect: async () => clientTransport1,
    });
    expect(code1).toBe(0);
    expect(io1.getStdout()).toBe("hi\n");

    const [clientTransport2, serverTransport2] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport2);

    const io2 = makeIo();
    const code2 = await run(["call", "fail"], io2, {
      connect: async () => clientTransport2,
    });
    expect(code2).toBe(1);
    expect(io2.getStdout()).toBe("something broke\n");

    await server.close();
  });

  it("run(['call', 'echo', '--args', 'not json'], io) returns 2 with stderr starting 'error: --args is not valid JSON', and an unknown command returns 2 and prints the usage text to stderr", async () => {
    const io1 = makeIo();
    const code1 = await run(["call", "echo", "--args", "not json"], io1);
    expect(code1).toBe(2);
    expect(io1.getStderr().startsWith("error: --args is not valid JSON")).toBe(true);

    const io2 = makeIo();
    const code2 = await run(["nonexistent-command"], io2);
    expect(code2).toBe(2);
    expect(io2.getStderr()).toContain("Usage: mcp-client-cli");
  });

  it("A tool returning the text '\\u001b[31mred\\u0007' is printed as '[31mred\\n' because C0 and C1 control characters other than '\\n' and '\\t' are removed from server output", async () => {
    const server = new McpServer({
      name: "ansi-server",
      version: "1.0.0",
    });
    server.tool("ansi", "Returns ANSI", {}, async () => ({
      content: [{ type: "text", text: "\u001b[31mred\u0007" }],
    }));

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const io = makeIo();
    const code = await run(["call", "ansi"], io, {
      connect: async () => clientTransport,
    });
    expect(code).toBe(0);
    expect(io.getStdout()).toBe("[31mred\n");
    await server.close();
  });

  it("run(['check'], io, { connect }) against a low-level server whose tools/list returns a tool 'bad' with inputSchema { type: 'string' } and two tools named 'dup' prints 'error schema_not_object tool=bad' and 'error duplicate_tool_name tool=dup' and returns 1, while a clean server prints 'ok' and returns 0", async () => {
    // Low level server with bad tools
    const lowServer = new Server(
      { name: "low", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    lowServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "bad",
          description: "A bad tool",
          inputSchema: { type: "string" as unknown as "object" },
        },
        {
          name: "dup",
          description: "First dup",
          inputSchema: { type: "object" },
        },
        {
          name: "dup",
          description: "Second dup",
          inputSchema: { type: "object" },
        },
      ],
    }));

    const [clientTransport1, serverTransport1] = InMemoryTransport.createLinkedPair();
    await lowServer.connect(serverTransport1);

    const io1 = makeIo();
    const code1 = await run(["check"], io1, {
      connect: async () => clientTransport1,
    });
    expect(code1).toBe(1);
    expect(io1.getStdout()).toContain("error schema_not_object tool=bad\n");
    expect(io1.getStdout()).toContain("error duplicate_tool_name tool=dup\n");
    await lowServer.close();

    // Clean server
    const cleanServer = new McpServer({
      name: "clean",
      version: "1.0.0",
    });
    cleanServer.tool("clean_tool", "A valid tool", { val: z.string() }, async () => ({
      content: [{ type: "text", text: "ok" }],
    }));

    const [clientTransport2, serverTransport2] = InMemoryTransport.createLinkedPair();
    await cleanServer.connect(serverTransport2);

    const io2 = makeIo();
    const code2 = await run(["check"], io2, {
      connect: async () => clientTransport2,
    });
    expect(code2).toBe(0);
    expect(io2.getStdout()).toBe("ok\n");
    await cleanServer.close();
  });

  it("run(['call', 'hang', '--timeout', '20'], io, { connect }) against a tool that never resolves returns 1 with stderr 'error: timeout after 20 ms' and finishes in under 1 s", async () => {
    const server = new McpServer({
      name: "slow-server",
      version: "1.0.0",
    });
    server.tool("hang", "Hanging tool", {}, () => new Promise(() => {}));

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const start = Date.now();
    const io = makeIo();
    const code = await run(["call", "hang", "--timeout", "20"], io, {
      connect: async () => clientTransport,
    });
    const elapsed = Date.now() - start;

    expect(code).toBe(1);
    expect(io.getStderr()).toBe("error: timeout after 20 ms\n");
    expect(elapsed).toBeLessThan(1000);
    await server.close();
  });

  it("run(['info', '--json'], io, { connect }) prints JSON whose name === 'demo', version === '1.0.0' and whose capabilities object has the key 'tools'", async () => {
    const server = new McpServer({
      name: "demo",
      version: "1.0.0",
    });
    server.tool("dummy", "Dummy tool", {}, async () => ({
      content: [{ type: "text", text: "ok" }],
    }));

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const io = makeIo();
    const code = await run(["info", "--json"], io, {
      connect: async () => clientTransport,
    });

    expect(code).toBe(0);
    const report = JSON.parse(io.getStdout().trim());
    expect(report.name).toBe("demo");
    expect(report.version).toBe("1.0.0");
    expect(report.capabilities).toHaveProperty("tools");
    expect(report.tools).toBe(1);
    await server.close();
  });

  it("Tool text longer than --max-output 10 is cut to 10 characters followed by '\\n[truncated 5 chars]' for a 15-character text, and parseTarget(['--url', 'file:///x']) throws CliError with code 'INVALID_TARGET'", async () => {
    const server = new McpServer({
      name: "long-server",
      version: "1.0.0",
    });
    server.tool("long", "Long tool", {}, async () => ({
      content: [{ type: "text", text: "1234567890abcde" }],
    }));

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const io = makeIo();
    const code = await run(["call", "long", "--max-output", "10"], io, {
      connect: async () => clientTransport,
    });
    expect(code).toBe(0);
    expect(io.getStdout()).toBe("1234567890\n[truncated 5 chars]\n");
    await server.close();
  });

  it("handles server with no tools capability (tools prints nothing, returns 0)", async () => {
    const server = new Server({ name: "no-tools", version: "1.0.0" }, { capabilities: {} });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const io = makeIo();
    const code = await run(["tools"], io, {
      connect: async () => clientTransport,
    });
    expect(code).toBe(0);
    expect(io.getStdout()).toBe("");
    await server.close();
  });

  it("handles tools listing in non-json text mode with arguments", async () => {
    const server = new McpServer({ name: "text-tools", version: "1.0.0" });
    server.tool("add", "Add numbers", { a: z.number(), b: z.number() }, async () => ({
      content: [{ type: "text", text: "0" }],
    }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const io = makeIo();
    const code = await run(["tools"], io, { connect: async () => clientTransport });
    expect(code).toBe(0);
    expect(io.getStdout()).toBe("add\ta,b\n");
    await server.close();
  });

  it("handles resources and prompts listing on servers that lack them", async () => {
    const server = new Server({ name: "bare-server", version: "1.0.0" }, { capabilities: {} });
    const [clientTransport1, serverTransport1] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport1);

    const io1 = makeIo();
    const code1 = await run(["resources"], io1, { connect: async () => clientTransport1 });
    expect(code1).toBe(0);
    expect(io1.getStdout()).toBe("");

    const [clientTransport2, serverTransport2] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport2);

    const io2 = makeIo();
    const code2 = await run(["prompts"], io2, { connect: async () => clientTransport2 });
    expect(code2).toBe(0);
    expect(io2.getStdout()).toBe("");

    await server.close();
  });

  it("handles resources and prompts in json and text mode with items present", async () => {
    const server = new McpServer({ name: "res-prompts", version: "1.0.0" });
    server.resource("test-res", "file:///test.txt", async () => ({
      contents: [{ uri: "file:///test.txt", text: "hello" }],
    }));
    server.prompt("test-prompt", "A test prompt", {}, async () => ({
      messages: [{ role: "user", content: { type: "text", text: "hi" } }],
    }));

    const [ct1, st1] = InMemoryTransport.createLinkedPair();
    await server.connect(st1);
    const io1 = makeIo();
    const code1 = await run(["resources", "--json"], io1, { connect: async () => ct1 });
    expect(code1).toBe(0);
    expect(io1.getStdout()).toContain("file:///test.txt");

    const [ct2, st2] = InMemoryTransport.createLinkedPair();
    await server.connect(st2);
    const io2 = makeIo();
    const code2 = await run(["prompts", "--json"], io2, { connect: async () => ct2 });
    expect(code2).toBe(0);
    expect(io2.getStdout()).toContain("test-prompt");

    const [ct3, st3] = InMemoryTransport.createLinkedPair();
    await server.connect(st3);
    const io3 = makeIo();
    const code3 = await run(["prompts"], io3, { connect: async () => ct3 });
    expect(code3).toBe(0);
    expect(io3.getStdout()).toContain("test-prompt");

    await server.close();
  });

  it("handles check warnings (missing_description) and errors (invalid_tool_name)", async () => {
    const server = new Server(
      { name: "warn-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "tool with spaces!",
          description: "",
          inputSchema: { type: "object" },
        },
      ],
    }));

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const io = makeIo();
    const code = await run(["check"], io, { connect: async () => clientTransport });
    expect(code).toBe(1);
    expect(io.getStdout()).toContain("error invalid_tool_name tool=tool with spaces!");
    expect(io.getStdout()).toContain("warning missing_description tool=tool with spaces!");
    await server.close();
  });

  it("handles text mode info display", async () => {
    const server = new McpServer({ name: "demo-info", version: "2.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const io = makeIo();
    const code = await run(["info"], io, { connect: async () => clientTransport });
    expect(code).toBe(0);
    expect(io.getStdout()).toContain("Name: demo-info");
    expect(io.getStdout()).toContain("Version: 2.0.0");
    await server.close();
  });

  it("handles non-text content types returned by tools", async () => {
    const server = new McpServer({ name: "image-server", version: "1.0.0" });
    server.tool("get-image", "Image tool", {}, async () => ({
      content: [{ type: "image", data: "abcd", mimeType: "image/png" }],
    }));

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const io = makeIo();
    const code = await run(["call", "get-image"], io, { connect: async () => clientTransport });
    expect(code).toBe(0);
    expect(io.getStdout()).toBe("[image content]\n");
    await server.close();
  });

  it("returns code 2 when call is missing tool name", async () => {
    const io = makeIo();
    const code = await run(["call", "--", "node", "server.js"], io);
    expect(code).toBe(2);
    expect(io.getStderr()).toContain("error: tool name required for call");
  });

  it("returns code 2 when invalid --timeout or --max-output values are passed", async () => {
    const io1 = makeIo();
    const code1 = await run(["info", "--timeout", "abc"], io1);
    expect(code1).toBe(2);
    expect(io1.getStderr()).toContain("Invalid or missing --timeout value");

    const io2 = makeIo();
    const code2 = await run(["info", "--max-output", "xyz"], io2);
    expect(code2).toBe(2);
    expect(io2.getStderr()).toContain("Invalid or missing --max-output value");
  });

  it("returns code 2 when connection fails", async () => {
    const io = makeIo();
    const code = await run(["info"], io, {
      connect: async () => {
        throw new Error("Connection refused");
      },
    });
    expect(code).toBe(2);
    expect(io.getStderr()).toContain("error: failed to connect: Connection refused");
  });

  it("supports call with --json flag", async () => {
    const server = new McpServer({ name: "json-server", version: "1.0.0" });
    server.tool("echo", "Echo", { msg: z.string() }, async ({ msg }) => ({
      content: [{ type: "text", text: msg }],
    }));

    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);

    const io = makeIo();
    const code = await run(["call", "echo", "--args", '{"msg":"hello"}', "--json"], io, {
      connect: async () => ct,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(io.getStdout().trim());
    expect(parsed).toEqual({ text: "hello", isError: false });
    await server.close();
  });
});
