import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/server/session";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/logo";
import { Button, ButtonLink } from "@/components/ui";
import { startDemoAction } from "./(auth)/actions";

export default async function Landing() {
  if (await getSessionUser()) redirect("/today");
  const demo = process.env.DEMO_MODE_ENABLED === "true";
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-10">
      <div className="flex items-center gap-2 font-semibold">
        <Logo /> {brand.name}
      </div>
      <section className="mt-16 flex-1">
        <h1 className="text-4xl font-bold leading-tight tracking-tight">{brand.tagline}</h1>
        <ul className="mt-8 space-y-4 text-[15px] text-muted">
          <li><strong className="text-text">Today</strong>: your schedule, budget left, bills due and one next best action.</li>
          <li><strong className="text-text">Money</strong>: accurate tracking in rupees. Transfers, card payments and refunds are handled correctly.</li>
          <li><strong className="text-text">Plan</strong>: a weekly review that can say &ldquo;build cash first&rdquo; as readily as &ldquo;invest&rdquo;.</li>
          <li><strong className="text-text">Signals</strong>: business news explained, with facts kept apart from interpretation.</li>
          <li><strong className="text-text">Schedule</strong>: realistic days with buffers, and no guilt when things slip.</li>
        </ul>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/sign-up" className="sm:flex-1">Create account</ButtonLink>
          <ButtonLink href="/sign-in" variant="secondary" className="sm:flex-1">Sign in</ButtonLink>
        </div>
        {demo ? (
          <form action={startDemoAction} className="mt-3">
            <Button variant="ghost" className="w-full">Explore with sample data →</Button>
          </form>
        ) : null}
      </section>
      <footer className="mt-12 text-xs text-subtle">
        Educational planning tool. Not investment, tax or legal advice. Never asks for bank credentials.{" "}
        <Link href="/about" className="underline">About & disclosures</Link>
      </footer>
    </main>
  );
}
