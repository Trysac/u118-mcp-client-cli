import { describe, expect, it } from "vitest";
import { CliError } from "../src/index.js";

describe("CliError", () => {
  it("sets the stable code and name", () => {
    const err = new CliError("TIMEOUT", "Operation timed out");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CliError);
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toBe("Operation timed out");
    expect(err.name).toBe("CliError");
  });

  it("caps messages exceeding 200 characters", () => {
    const longMsg = "A".repeat(250);
    const err = new CliError("USAGE", longMsg);
    expect(err.message.length).toBe(200);
    expect(err.message.endsWith("...")).toBe(true);
  });
});
