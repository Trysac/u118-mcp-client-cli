import { describe, expect, it } from "vitest";
import { CliError, parseTarget } from "../src/index.js";

describe("parseTarget", () => {
  it("parses stdio targets using -- separator", () => {
    const target = parseTarget(["tools", "--", "node", "server.js", "--flag"]);
    expect(target).toEqual({
      kind: "stdio",
      command: "node",
      args: ["server.js", "--flag"],
    });
  });

  it("throws INVALID_TARGET if no command provided after --", () => {
    expect(() => parseTarget(["tools", "--"])).toThrow(CliError);
    expect(() => parseTarget(["tools", "--", " "])).toThrowError(/No command provided after --/);
  });

  it("parses valid http and https URLs", () => {
    const httpTarget = parseTarget(["--url", "http://127.0.0.1:8080/mcp"]);
    expect(httpTarget).toEqual({
      kind: "http",
      url: "http://127.0.0.1:8080/mcp",
    });

    const httpsTarget = parseTarget(["--url", "https://example.com/api/mcp"]);
    expect(httpsTarget).toEqual({
      kind: "http",
      url: "https://example.com/api/mcp",
    });
  });

  it("throws CliError with code INVALID_TARGET for unsupported URL schemes or invalid URLs", () => {
    expect(() => parseTarget(["--url", "file:///x"])).toThrow(CliError);
    try {
      parseTarget(["--url", "file:///x"]);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe("INVALID_TARGET");
    }

    expect(() => parseTarget(["--url", "not-a-valid-url"])).toThrow(CliError);
    expect(() => parseTarget(["--url"])).toThrow(CliError);
  });

  it("throws INVALID_TARGET when neither --url nor -- is present", () => {
    expect(() => parseTarget(["tools", "--json"])).toThrow(CliError);
  });
});
