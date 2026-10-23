import Link from "next/link";
import { brand } from "@/lib/brand";

export const metadata = { title: "About & disclosures" };

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
      <Link href="/" className="text-sm text-muted">← {brand.name}</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">About & disclosures</h1>
      <h2 className="mt-6 text-lg font-semibold">What this is</h2>
      <p className="mt-1 text-muted">{brand.name} is a personal tool for tracking money, planning, reading business news and following through on routines. It is educational. It is not investment, tax or legal advice, and it is not a registered investment adviser.</p>
      <h2 className="mt-6 text-lg font-semibold">Investment content</h2>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
        <li>Plans stay at the asset-class level (equity, debt, gold, cash) and never name specific products or securities.</li>
        <li>Scenario figures are illustrations based on editable assumptions, not predictions or promises of returns.</li>
        <li>The app never executes trades or moves money.</li>
        <li>For personalised advice, consult a SEBI-registered investment adviser.</li>
      </ul>
      <h2 className="mt-6 text-lg font-semibold">News</h2>
      <p className="mt-1 text-muted">Stories link to original reporting. Explanations separate reported facts from interpretation and hypothetical effects. When no licensed feed is configured, clearly labelled fictional demonstration stories are shown instead. News is never a signal to trade.</p>
      <h2 className="mt-6 text-lg font-semibold">Your data</h2>
      <p className="mt-1 text-muted">No bank credentials are ever requested. Data can be exported or deleted at any time from Settings → Data & privacy. AI features are off by default.</p>
      <h2 className="mt-6 text-lg font-semibold">Gamification</h2>
      <p className="mt-1 text-muted">Progress rewards consistency, learning and follow-through, never spending, trading frequency, risk-taking or investment returns. There are no public leaderboards.</p>
    </main>
  );
}
