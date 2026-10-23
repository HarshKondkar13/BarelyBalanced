import { getContext } from "@/server/context";
import { leaveDemoAction } from "@/app/(app)/_actions/settings";
import { Button, ButtonLink, Card, CardHeader, Notice, PageHeader, SubNav } from "@/components/ui";
import { SETTINGS_TABS } from "../tabs";
import { DeleteAccount } from "./delete-account";

export const metadata = { title: "Data & privacy" };

export default async function DataPage() {
  const { user } = await getContext();
  return (
    <>
      <PageHeader title="Data & privacy" />
      <SubNav items={SETTINGS_TABS} active="/settings/data" />
      {user.isDemo ? (
        <Notice tone="accent" className="mb-4" title="You're in demo mode">
          Everything here is sample data in a separate demo account.
          <form action={leaveDemoAction} className="mt-2"><Button size="sm">Discard demo and create my own account</Button></form>
        </Notice>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Export" subtitle="Your data, in open formats" />
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/api/export?format=csv" variant="secondary" prefetch={false}>Transactions (CSV)</ButtonLink>
            <ButtonLink href="/api/export?format=json" variant="secondary" prefetch={false}>Everything (JSON)</ButtonLink>
          </div>
          <p className="mt-2 text-xs text-muted">The JSON export includes accounts, transactions, budgets, goals, holdings, tasks, habits, reviews and settings. Integration tokens are never exported.</p>
        </Card>
        <Card>
          <CardHeader title="How your data is handled" />
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Every record is tied to your account and checked on the server for every request.</li>
            <li>Calendar tokens are encrypted at rest (AES-256-GCM) and never sent to your browser.</li>
            <li>Logs exclude tokens, amounts, descriptions and notes.</li>
            <li>AI features are off by default; when on, only the minimum described in Settings is sent.</li>
            <li>No bank credentials, ever.</li>
          </ul>
        </Card>
        <Card className="md:col-span-2 border-danger/40">
          <CardHeader title="Delete account" subtitle="Revokes integrations, then permanently deletes all your data. This cannot be undone." />
          <DeleteAccount />
        </Card>
      </div>
    </>
  );
}
