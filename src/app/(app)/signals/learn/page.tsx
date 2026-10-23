import { getContext } from "@/server/context";
import { learnedConcepts } from "@/server/signals-meta";
import { CONCEPTS } from "@/lib/news/concepts";
import { PageHeader, SubNav } from "@/components/ui";
import { ConceptCard } from "@/components/concept-card";
import { SIGNAL_TABS } from "../tabs";

export const metadata = { title: "Concepts" };

export default async function LearnPage() {
  const ctx = await getContext();
  const learned = await learnedConcepts(ctx);
  return (
    <>
      <PageHeader title="Concepts" subtitle={`${learned.size} of ${CONCEPTS.length} learned`} />
      <SubNav items={SIGNAL_TABS} active="/signals/learn" />
      <div className="space-y-2">{CONCEPTS.map((c) => <ConceptCard key={c.id} concept={c} learned={learned.has(c.id)} />)}</div>
      <p className="mt-4 text-xs text-subtle">General educational explanations with round, illustrative numbers. Not current data or advice.</p>
    </>
  );
}
