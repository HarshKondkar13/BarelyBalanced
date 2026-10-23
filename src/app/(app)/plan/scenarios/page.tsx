import { getContext } from "@/server/context";
import { loadFinanceSnapshot } from "@/server/views";
import { buildPlan } from "@/server/plan";
import { PageHeader, SubNav } from "@/components/ui";
import { PLAN_TABS } from "../tabs";
import { PlanDisclaimer } from "../disclaimer";
import { ScenarioLab } from "./scenario-lab";

export const metadata = { title: "Scenarios" };

export default async function ScenariosPage() {
  const ctx = await getContext();
  const fin = await loadFinanceSnapshot(ctx);
  const { risk, sipMonthly } = buildPlan(ctx, fin);
  const investedNow = fin.holdings.filter((h) => h.assetClass !== "real_estate").reduce((a, h) => a + h.value, 0);
  return (
    <>
      <PageHeader title="Scenarios" subtitle="What different assumptions could mean over time" />
      <SubNav items={PLAN_TABS} active="/plan/scenarios" />
      <ScenarioLab defaultMonthly={sipMonthly || 5_000_00} defaultInitial={investedNow} risk={risk.level} />
      <PlanDisclaimer />
    </>
  );
}
