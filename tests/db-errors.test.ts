import { describe, expect, it } from "vitest";
import { classifyDbError } from "@/server/db-errors";

const wrapped = (code: string) => Object.assign(new Error("Failed query: select ..."), { cause: Object.assign(new Error("pg"), { code }) });

describe("database error classification", () => {
  it.each([
    ["42P01", "no_tables"],
    ["28P01", "bad_password"],
    ["3D000", "no_database"],
    ["ECONNREFUSED", "not_running"],
  ])("maps %s to %s through Drizzle's wrapper", (code, expected) => {
    expect(classifyDbError(wrapped(code))).toBe(expected);
  });
  it("returns null for unrelated errors", () => {
    expect(classifyDbError(new Error("boom"))).toBeNull();
    expect(classifyDbError(wrapped("23505"))).toBeNull();
  });
});
