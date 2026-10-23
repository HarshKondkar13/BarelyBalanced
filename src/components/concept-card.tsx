import type { Concept } from "@/lib/news/concepts";
import { ActionButton } from "@/components/toast";
import { learnConceptAction } from "@/app/(app)/_actions/signals";
import { Badge } from "@/components/ui";

export function ConceptCard({ concept, learned }: { concept: Concept; learned: boolean }) {
  return (
    <details className="rounded-xl border border-border bg-surface p-3">
      <summary className="flex min-h-10 items-center justify-between gap-2">
        <span><span className="font-semibold">Teach me: {concept.title}</span><span className="block text-xs text-muted">{concept.short}</span></span>
        {learned ? <Badge tone="positive">Learned</Badge> : <span className="chev text-primary" aria-hidden>›</span>}
      </summary>
      <div className="mt-2 space-y-2 text-sm">
        <p>{concept.explanation}</p>
        <p className="rounded-lg bg-surface-2 p-2"><strong>Example:</strong> {concept.example}</p>
        <p className="text-muted"><strong>Why you might care:</strong> {concept.whyYouCare}</p>
        {!learned ? <ActionButton action={learnConceptAction.bind(null, concept.id)} variant="soft">I understand this now</ActionButton> : null}
      </div>
    </details>
  );
}
