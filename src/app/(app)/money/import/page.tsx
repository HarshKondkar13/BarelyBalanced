import { desc, eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { loadAccounts } from "@/server/finance";
import { importBatches } from "@/db/schema";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { undoImportAction } from "@/app/(app)/_actions/import";
import { formatShortDate, toLocalDate } from "@/lib/dates";
import { MoneyNav } from "../money-nav";
import { Importer } from "./importer";

export const metadata = { title: "Import & export" };

export default async function ImportPage() {
  const { db, user, tz } = await getContext();
  const [accounts, batches] = await Promise.all([loadAccounts(db, user.id), db.select().from(importBatches).where(eq(importBatches.userId, user.id)).orderBy(desc(importBatches.createdAt)).limit(10)]);
  const active = accounts.filter((a) => !a.archived);
  return (
    <>
      <PageHeader title="Import & export" />
      <MoneyNav active="/money/import" />
      {active.length === 0 ? (
        <EmptyState title="Add an account first" action={<ButtonLink href="/money/accounts/new">Add account</ButtonLink>} />
      ) : (
        <Importer accounts={active.map((a) => ({ id: a.id, name: a.name, type: a.type }))} />
      )}
      {batches.length ? (
        <Card className="mt-4">
          <CardHeader title="Recent imports" />
          <ul className="divide-y divide-border text-sm">
            {batches.map((b) => (
              <li key={b.id} className="flex min-h-12 items-center justify-between gap-2 py-2">
                <span className="min-w-0"><span className="block truncate">{b.fileName}</span><span className="text-xs text-muted">{formatShortDate(toLocalDate(b.createdAt, tz))} · {b.importedCount} imported · {b.skippedDuplicates} duplicates skipped</span></span>
                <ActionButton action={undoImportAction.bind(null, b.id)} confirm="Remove all transactions from this import?">Undo</ActionButton>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card className="mt-4">
        <CardHeader title="Export" />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/api/export?format=csv" variant="secondary" prefetch={false}>Transactions (CSV)</ButtonLink>
          <ButtonLink href="/api/export?format=json" variant="secondary" prefetch={false}>All data (JSON)</ButtonLink>
        </div>
      </Card>
    </>
  );
}
