import { getContext } from "@/server/context";
import { loadAccounts, loadCategories } from "@/server/finance";
import { PageHeader } from "@/components/ui";
import { RecurringForm } from "../recurring-form";

export const metadata = { title: "Add bill or income" };

export default async function NewRecurringPage() {
  const { db, user, today } = await getContext();
  const [accounts, cats] = await Promise.all([loadAccounts(db, user.id), loadCategories(db, user.id)]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add a recurring item" subtitle="Bills, subscriptions, EMIs, SIPs or regular income" />
      <RecurringForm id={null} today={today} accounts={accounts.filter((a) => !a.archived)} categories={cats} />
    </div>
  );
}
