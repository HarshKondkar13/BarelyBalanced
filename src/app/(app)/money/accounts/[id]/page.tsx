import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { finAccounts } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { archiveAccountAction } from "@/app/(app)/_actions/money";
import { paiseToDecimalString } from "@/lib/money";
import { AccountForm } from "../account-form";

export const metadata = { title: "Edit account" };

export default async function EditAccountPage({ params }: PageProps<"/money/accounts/[id]">) {
  const { id } = await params;
  const { db, user, today } = await getContext();
  const [a] = await db.select().from(finAccounts).where(and(eq(finAccounts.id, id), eq(finAccounts.userId, user.id)));
  if (!a) notFound();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Edit account" action={<ActionButton action={archiveAccountAction.bind(null, a.id, !a.archived)}>{a.archived ? "Unarchive" : "Archive"}</ActionButton>} />
      <AccountForm
        id={a.id}
        today={today}
        initial={{ name: a.name, type: a.type, institution: a.institution, openingBalance: paiseToDecimalString(a.openingBalance), openingDate: a.openingDate, includeInNetWorth: a.includeInNetWorth, creditLimit: a.creditLimit ? paiseToDecimalString(a.creditLimit) : "" }}
      />
    </div>
  );
}
