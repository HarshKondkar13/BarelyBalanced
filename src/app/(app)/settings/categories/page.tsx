import { getContext } from "@/server/context";
import { loadCategories } from "@/server/finance";
import { saveCategoryAction, updateCategoryAction } from "@/app/(app)/_actions/money";
import { ActionForm } from "@/components/action-form";
import { ActionButton } from "@/components/toast";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, SubNav } from "@/components/ui";
import { SETTINGS_TABS } from "../tabs";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const { db, user } = await getContext();
  const cats = await loadCategories(db, user.id);
  return (
    <>
      <PageHeader title="Categories" subtitle="Essential categories feed the emergency-fund and surplus calculations" />
      <SubNav items={SETTINGS_TABS} active="/settings/categories" />
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card className="py-1">
          <ul className="divide-y divide-border">
            {cats.map((c) => (
              <li key={c.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className={c.archived ? "text-subtle line-through" : ""}>{c.name} <Badge>{c.kind}</Badge> {c.essential ? <Badge tone="primary">essential</Badge> : null}</span>
                <span className="flex gap-1">
                  {c.kind === "expense" ? <ActionButton action={updateCategoryAction.bind(null, c.id, { essential: !c.essential })} variant="ghost">{c.essential ? "Mark discretionary" : "Mark essential"}</ActionButton> : null}
                  <ActionButton action={updateCategoryAction.bind(null, c.id, { archived: !c.archived })} variant="ghost">{c.archived ? "Restore" : "Archive"}</ActionButton>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Add category" />
          <ActionForm action={saveCategoryAction} submitLabel="Add" resetOnSuccess>
            <Field label="Name" htmlFor="cn"><Input id="cn" name="name" required /></Field>
            <Field label="Kind" htmlFor="ck"><Select id="ck" name="kind"><option value="expense">Expense</option><option value="income">Income</option></Select></Field>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="essential" className="size-5 accent-[var(--primary)]" /> Essential</label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
