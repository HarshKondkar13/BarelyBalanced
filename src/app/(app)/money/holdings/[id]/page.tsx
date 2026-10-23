import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { holdings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { deleteHoldingAction } from "@/app/(app)/_actions/money";
import { paiseToDecimalString } from "@/lib/money";
import { HoldingForm } from "../holding-form";

export const metadata = { title: "Edit holding" };

export default async function EditHoldingPage({ params }: PageProps<"/money/holdings/[id]">) {
  const { id } = await params;
  const { db, user, today } = await getContext();
  const [h] = await db.select().from(holdings).where(and(eq(holdings.id, id), eq(holdings.userId, user.id)));
  if (!h) notFound();
  const d = (v: number | null) => (v === null ? "" : paiseToDecimalString(v));
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Update holding" action={<ActionButton action={deleteHoldingAction.bind(null, h.id)} confirm="Delete this holding?">Delete</ActionButton>} />
      <HoldingForm id={h.id} today={today} initial={{ name: h.name, assetClass: h.assetClass, value: d(h.value), valuationDate: h.valuationDate, costBasis: d(h.costBasis), monthlyContribution: d(h.monthlyContribution), includeInNetWorth: h.includeInNetWorth, notes: h.notes ?? "" }} />
    </div>
  );
}
