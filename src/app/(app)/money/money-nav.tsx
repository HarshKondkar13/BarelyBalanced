import { SubNav } from "@/components/ui";

export const MONEY_TABS = [
  { href: "/money", label: "Overview" },
  { href: "/money/transactions", label: "Transactions" },
  { href: "/money/budgets", label: "Budgets" },
  { href: "/money/bills", label: "Bills & subscriptions" },
  { href: "/money/accounts", label: "Accounts" },
  { href: "/money/holdings", label: "Holdings" },
  { href: "/money/import", label: "Import / export" },
];

export function MoneyNav({ active }: { active: string }) {
  return <SubNav items={MONEY_TABS} active={active} />;
}
