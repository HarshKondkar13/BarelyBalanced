import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { saveAccountAction } from "@/app/(app)/_actions/money";
import type { AccountType } from "@/db/schema";

export function AccountForm({ id, initial, today }: { id: string | null; today: string; initial?: { name: string; type: AccountType; institution: string | null; openingBalance: string; openingDate: string; includeInNetWorth: boolean; creditLimit: string } }) {
  return (
    <ActionForm action={saveAccountAction.bind(null, id)} submitLabel={id ? "Save account" : "Add account"}>
      <Field label="Account name" htmlFor="name">
        <Input id="name" name="name" defaultValue={initial?.name} placeholder="e.g. Salary account" required />
      </Field>
      <Field label="Type" htmlFor="type" hint="Credit cards and loans are tracked as money you owe.">
        <Select id="type" name="type" defaultValue={initial?.type ?? "bank"}>
          <option value="bank">Bank account</option>
          <option value="cash">Cash</option>
          <option value="wallet">Wallet / prepaid</option>
          <option value="credit_card">Credit card</option>
          <option value="investment">Investment cash flows (broker, MF folio)</option>
          <option value="loan">Loan</option>
        </Select>
      </Field>
      <Field label="Institution (optional)" htmlFor="institution">
        <Input id="institution" name="institution" defaultValue={initial?.institution ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening balance (₹)" htmlFor="openingBalance" hint="For cards and loans: amount owed. This is not income.">
          <Input id="openingBalance" name="openingBalance" inputMode="decimal" defaultValue={initial?.openingBalance ?? "0"} className="num" />
        </Field>
        <Field label="As of date" htmlFor="openingDate" hint="Transactions before this date don't change the balance.">
          <Input id="openingDate" name="openingDate" type="date" defaultValue={initial?.openingDate ?? today} />
        </Field>
      </div>
      <Field label="Credit limit (cards only, optional)" htmlFor="creditLimit">
        <Input id="creditLimit" name="creditLimit" inputMode="decimal" defaultValue={initial?.creditLimit ?? ""} className="num" />
      </Field>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" name="includeInNetWorth" defaultChecked={initial?.includeInNetWorth ?? true} className="mt-1 size-5 accent-[var(--primary)]" />
        <span>
          Include in net worth
          <span className="block text-xs text-muted">Turn this off for investment cash-flow accounts when you track their value under Holdings, so the same money isn&apos;t counted twice.</span>
        </span>
      </label>
    </ActionForm>
  );
}
