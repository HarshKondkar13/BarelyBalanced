import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { saveRecurringAction } from "@/app/(app)/_actions/money";

type Init = { name: string; direction: "outflow" | "inflow"; kind: string; amount: string; frequency: string; nextDueDate: string; categoryId: string | null; accountId: string | null; remindDaysBefore: number; essential: boolean };

export function RecurringForm({ id, initial, accounts, categories, today }: { id: string | null; initial?: Init; accounts: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string; kind: string }>; today: string }) {
  return (
    <ActionForm action={saveRecurringAction.bind(null, id)} submitLabel={id ? "Save" : "Add"}>
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" defaultValue={initial?.name} placeholder="e.g. Rent, Netflix, Salary" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={initial?.kind ?? "bill"}>
            <option value="bill">Bill</option>
            <option value="subscription">Subscription</option>
            <option value="emi">EMI / loan</option>
            <option value="investment">SIP / planned investment</option>
            <option value="income">Income</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Direction" htmlFor="direction">
          <Select id="direction" name="direction" defaultValue={initial?.direction ?? "outflow"}>
            <option value="outflow">Money out</option>
            <option value="inflow">Money in</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="amount">
          <Input id="amount" name="amount" inputMode="decimal" defaultValue={initial?.amount} className="num" required />
        </Field>
        <Field label="Repeats" htmlFor="frequency">
          <Select id="frequency" name="frequency" defaultValue={initial?.frequency ?? "monthly"}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next due" htmlFor="nextDueDate">
          <Input id="nextDueDate" name="nextDueDate" type="date" defaultValue={initial?.nextDueDate ?? today} required />
        </Field>
        <Field label="Remind days before" htmlFor="remindDaysBefore">
          <Input id="remindDaysBefore" name="remindDaysBefore" type="number" min={0} max={30} defaultValue={initial?.remindDaysBefore ?? 2} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Account (optional)" htmlFor="accountId">
          <Select id="accountId" name="accountId" defaultValue={initial?.accountId ?? ""}>
            <option value="">Not set</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Category (optional)" htmlFor="categoryId">
          <Select id="categoryId" name="categoryId" defaultValue={initial?.categoryId ?? ""}>
            <option value="">Not set</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" name="essential" defaultChecked={initial?.essential ?? true} className="mt-1 size-5 accent-[var(--primary)]" />
        <span>Essential commitment<span className="block text-xs text-muted">Used when estimating what must be paid before any money is treated as investable.</span></span>
      </label>
    </ActionForm>
  );
}
