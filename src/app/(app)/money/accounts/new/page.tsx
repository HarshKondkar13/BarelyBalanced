import { getContext } from "@/server/context";
import { PageHeader } from "@/components/ui";
import { AccountForm } from "../account-form";

export const metadata = { title: "Add account" };

export default async function NewAccountPage() {
  const { today } = await getContext();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add account" subtitle="Manual tracking only. We never ask for bank logins." />
      <AccountForm id={null} today={today} />
    </div>
  );
}
