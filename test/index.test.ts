import { describe, expect, it } from "vitest";
import * as mcpCli from "../src/index.js";

describe("exports", () => {
  it("exports all public API members", () => {
    expect(typeof mcpCli.run).toBe("function");
    expect(typeof mcpCli.inspect).toBe("function");
    expect(typeof mcpCli.callTool).toBe("function");
    expect(typeof mcpCli.checkServer).toBe("function");
    expect(typeof mcpCli.parseTarget).toBe("function");
    expect(typeof mcpCli.CliError).toBe("function");
  });
});
