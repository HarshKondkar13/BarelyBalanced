import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { loadAccounts, loadCategories } from "@/server/finance";
import { recurringItems } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { deleteRecurringAction } from "@/app/(app)/_actions/money";
import { paiseToDecimalString } from "@/lib/money";
import { RecurringForm } from "../recurring-form";

export const metadata = { title: "Edit recurring item" };

export default async function EditRecurringPage({ params }: PageProps<"/money/bills/[id]">) {
  const { id } = await params;
  const { db, user, today } = await getContext();
  const [r] = await db.select().from(recurringItems).where(and(eq(recurringItems.id, id), eq(recurringItems.userId, user.id)));
  if (!r) notFound();
  const [accounts, cats] = await Promise.all([loadAccounts(db, user.id), loadCategories(db, user.id)]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Edit" action={<ActionButton action={deleteRecurringAction.bind(null, r.id)} confirm="Delete this recurring item? Past transactions are kept.">Delete</ActionButton>} />
      <RecurringForm id={r.id} today={today} accounts={accounts} categories={cats} initial={{ ...r, amount: paiseToDecimalString(r.amount) }} />
    </div>
  );
}
