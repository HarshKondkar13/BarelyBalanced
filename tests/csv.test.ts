import { describe, expect, it } from "vitest";
import { detectDateFormat, fingerprint, parseCsv, parseDate, suggestMapping, toCsv, validateRows } from "@/lib/csv/import";

const HDFC_LIKE = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/10/26,SALARY OCT 2026,REF1,01/10/26,,"92,000.00","1,50,000.00"
02/10/26,UPI-SWIGGY-123456789,REF2,02/10/26,450.00,,"1,49,550.00"
02/10/26,UPI-SWIGGY-123456789,REF2,02/10/26,450.00,,"1,49,100.00"
05/10/26,CREDIT CARD PAYMENT XX1234,REF3,05/10/26,"12,000.00",,"1,37,100.00"
06/10/26,BAD ROW,REF4,06/10/26,abc,,
31/02/26,IMPOSSIBLE DATE,REF5,31/02/26,10.00,,
`;

describe("csv import", () => {
  it("suggests a mapping for debit/credit statements and detects DD/MM/YY", () => {
    const p = parseCsv(HDFC_LIKE);
    const m = suggestMapping(p);
    expect(m.date).toBe("Date");
    expect(m.description).toBe("Narration");
    expect(m.debit).toBe("Withdrawal Amt.");
    expect(m.credit).toBe("Deposit Amt.");
    expect(m.dateFormat).toBe("DD/MM/YY");
  });

  it("validates rows, flags in-file repeats, converts card payments to transfers", () => {
    const p = parseCsv(HDFC_LIKE);
    const m = { ...suggestMapping(p), transferAccountId: "card-1" };
    const r = validateRows(p, m, "bank-1", []);
    expect(r[0]).toMatchObject({ status: "ok", txn: { type: "income", amount: 9_200_000, date: "2026-10-01" } });
    expect(r[1].status).toBe("ok");
    expect(r[2].status).toBe("possible_duplicate");
    expect(r[3].txn?.type).toBe("transfer");
    expect(r[3].txn?.toAccountId).toBe("card-1");
    expect(r[4].status).toBe("error");
    expect(r[5].status).toBe("error"); // 31 Feb
  });

  it("skips exact re-imports via fingerprint", () => {
    const p = parseCsv(HDFC_LIKE);
    const m = suggestMapping(p);
    const existing = [{ date: "2026-10-01", signedAmount: 9_200_000, description: "SALARY OCT 2026", fingerprint: fingerprint("bank-1", "2026-10-01", 9_200_000, "SALARY OCT 2026") }];
    expect(validateRows(p, m, "bank-1", existing)[0].status).toBe("duplicate");
  });

  it("flags near-duplicates of manually entered transactions", () => {
    const p = parseCsv(HDFC_LIKE);
    const existing = [{ date: "2026-10-02", signedAmount: -45_000, description: "upi swiggy", fingerprint: null }];
    expect(validateRows(p, suggestMapping(p), "bank-1", existing)[1].status).toBe("possible_duplicate");
  });

  it("parses single signed amount columns either way round", () => {
    const p = parseCsv("Txn Date,Description,Amount\n2026-10-03,Coffee,-120.50\n2026-10-04,Refund,99\n");
    const m = suggestMapping(p);
    expect(m.amount).toBe("Amount");
    const r = validateRows(p, m, "a", []);
    expect(r[0].txn).toMatchObject({ type: "expense", amount: 12050 });
    const flipped = validateRows(p, { ...m, negativeIsExpense: false }, "a", []);
    expect(flipped[0].txn?.type).toBe("income");
  });

  it("parses common date formats", () => {
    expect(parseDate("05-Oct-2026", "DD-MMM-YYYY")).toBe("2026-10-05");
    expect(parseDate("05 October 2026", "DD-MMM-YYYY")).toBe("2026-10-05");
    expect(parseDate("10/05/2026", "MM/DD/YYYY")).toBe("2026-10-05");
    expect(parseDate("05/10/2026 14:22", "DD/MM/YYYY")).toBe("2026-10-05");
    expect(detectDateFormat(["2026-10-01", "2026-10-02"])).toBe("YYYY-MM-DD");
  });

  it("rejects files without a usable header", () => {
    expect(() => parseCsv("just one column\nvalue")).toThrow();
  });

  it("guards exported CSV against formula injection", () => {
    const out = toCsv([{ d: "=HYPERLINK(\"x\")", a: "-120.50" }], ["d", "a"]);
    expect(out).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out).toContain("-120.50");
  });
});
