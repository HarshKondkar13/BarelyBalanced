import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { saveGoalAction } from "@/app/(app)/_actions/money";

type Init = { name: string; kind: string; targetAmount: string; targetDate: string; priority: number; plannedMonthly: string };

export function GoalForm({ id, initial }: { id: string | null; initial?: Init }) {
  return (
    <ActionForm action={saveGoalAction.bind(null, id)} submitLabel={id ? "Save goal" : "Add goal"}>
      <Field label="Goal" htmlFor="name"><Input id="name" name="name" defaultValue={initial?.name} placeholder="e.g. Emergency fund, CFA fees, Laptop" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={initial?.kind ?? "other"}>
            <option value="emergency">Emergency fund</option><option value="purchase">Purchase</option><option value="education">Education</option><option value="travel">Travel</option><option value="retirement">Retirement</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={String(initial?.priority ?? 2)}>
            <option value="1">High</option><option value="2">Medium</option><option value="3">Low</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target amount (₹)" htmlFor="targetAmount"><Input id="targetAmount" name="targetAmount" inputMode="decimal" className="num" defaultValue={initial?.targetAmount} required /></Field>
        <Field label="Target date" htmlFor="targetDate" hint="Optional"><Input id="targetDate" name="targetDate" type="date" defaultValue={initial?.targetDate} /></Field>
      </div>
      <Field label="Planned monthly contribution (₹)" htmlFor="plannedMonthly" hint="A plan, not a transaction. Actual contributions are recorded separately."><Input id="plannedMonthly" name="plannedMonthly" inputMode="decimal" className="num" defaultValue={initial?.plannedMonthly} /></Field>
    </ActionForm>
  );
}
