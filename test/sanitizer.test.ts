import { describe, expect, it } from "vitest";
import { sanitizeAndTruncate, sanitizeControlCharacters } from "../src/index.js";

describe("sanitizer", () => {
  it("removes C0 and C1 control characters except newline and tab", () => {
    // \u001b (ESC), \u0007 (BEL), \u0000 (NUL), \u0080, \u009F
    const raw = "\u001b[31mred\u0007\t\nworld\u0000\u0080";
    const cleaned = sanitizeControlCharacters(raw);
    expect(cleaned).toBe("[31mred\t\nworld");
  });

  it("truncates output longer than maxOutput with truncation marker", () => {
    const text = "1234567890abcde"; // 15 characters
    const truncated = sanitizeAndTruncate(text, 10);
    expect(truncated).toBe("1234567890\n[truncated 5 chars]");
  });

  it("keeps output untouched when within maxOutput limit", () => {
    const text = "hello";
    expect(sanitizeAndTruncate(text, 10)).toBe("hello");
    expect(sanitizeAndTruncate(text, 5)).toBe("hello");
  });

  it("handles zero or negative maxOutput safely", () => {
    const text = "hello";
    expect(sanitizeAndTruncate(text, 0)).toBe("\n[truncated 5 chars]");
    expect(sanitizeAndTruncate(text, -2)).toBe("\n[truncated 5 chars]");
  });
});
