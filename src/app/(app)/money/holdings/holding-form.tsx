import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { saveHoldingAction } from "@/app/(app)/_actions/money";

type Init = { name: string; assetClass: string; value: string; valuationDate: string; costBasis: string; monthlyContribution: string; includeInNetWorth: boolean; notes: string };

export function HoldingForm({ id, initial, today }: { id: string | null; initial?: Init; today: string }) {
  return (
    <ActionForm action={saveHoldingAction.bind(null, id)} submitLabel={id ? "Save holding" : "Add holding"}>
      <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={initial?.name} placeholder="e.g. Nifty 50 index fund, EPF, PPF" required /></Field>
      <Field label="Asset class" htmlFor="assetClass" hint="Used for allocation views. Hybrid funds: pick the dominant class or split into two entries.">
        <Select id="assetClass" name="assetClass" defaultValue={initial?.assetClass ?? "equity"}>
          <option value="equity">Equity</option>
          <option value="debt">Debt / fixed income (FD, PPF, EPF, debt funds)</option>
          <option value="gold">Gold</option>
          <option value="cash">Cash-like (liquid funds)</option>
          <option value="real_estate">Real estate</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current value (₹)" htmlFor="value"><Input id="value" name="value" inputMode="decimal" defaultValue={initial?.value} className="num" required /></Field>
        <Field label="Valued on" htmlFor="valuationDate" hint="From your statement or app."><Input id="valuationDate" name="valuationDate" type="date" max={today} defaultValue={initial?.valuationDate ?? today} required /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount invested (optional)" htmlFor="costBasis"><Input id="costBasis" name="costBasis" inputMode="decimal" defaultValue={initial?.costBasis} className="num" /></Field>
        <Field label="Monthly contribution (optional)" htmlFor="monthlyContribution"><Input id="monthlyContribution" name="monthlyContribution" inputMode="decimal" defaultValue={initial?.monthlyContribution} className="num" /></Field>
      </div>
      <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes} /></Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="includeInNetWorth" defaultChecked={initial?.includeInNetWorth ?? true} className="size-5 accent-[var(--primary)]" /> Include in net worth
      </label>
    </ActionForm>
  );
}
