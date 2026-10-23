import { describe, expect, it } from "vitest";
import { allocate, formatINR, formatINRCompact, parseRupeesToPaise, paiseToDecimalString } from "@/lib/money";

describe("parseRupeesToPaise", () => {
  it.each([
    ["1,23,456.78", 12345678],
    ["₹ 1,200", 120000],
    ["Rs. 99.5", 9950],
    ["0.10", 10],
    ["-45", -4500],
    ["(45.00)", -4500],
    ["250 Dr", -25000],
    ["250 Cr", 25000],
    ["007", 700],
  ])("parses %s", (input, expected) => {
    expect(parseRupeesToPaise(input)).toBe(expected);
  });

  it("avoids float drift (0.1 + 0.2 style)", () => {
    expect(parseRupeesToPaise("0.1") + parseRupeesToPaise("0.2")).toBe(parseRupeesToPaise("0.3"));
  });

  it.each(["", "abc", "1.234", "1e3", "12..3"])("rejects %s", (input) => {
    expect(() => parseRupeesToPaise(input)).toThrow();
  });
});

describe("formatting", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
    expect(formatINR(-50000, { whole: true })).toBe("−₹500");
  });
  it("formats compact lakh/crore", () => {
    expect(formatINRCompact(1_50_000_00)).toBe("₹1.5L");
    expect(formatINRCompact(2_30_00_000_00)).toBe("₹2.3Cr");
  });
  it("round-trips decimal strings", () => {
    expect(paiseToDecimalString(-105)).toBe("-1.05");
    expect(parseRupeesToPaise(paiseToDecimalString(123456))).toBe(123456);
  });
});

describe("allocate", () => {
  it("always sums exactly to the total", () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
  it("handles negative amounts", () => {
    expect(allocate(-101, [1, 1]).reduce((a, b) => a + b, 0)).toBe(-101);
  });
});
