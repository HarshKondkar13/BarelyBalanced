import Link from "next/link";
import { AuthForm } from "../auth-form";
import { signInAction, startDemoAction } from "../actions";
import { Button, Notice } from "@/components/ui";
import { DB_PROBLEM_HELP, type DbProblem } from "@/server/db-errors";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const demo = process.env.DEMO_MODE_ENABLED === "true";
  const db = (await searchParams).db;
  const problem = typeof db === "string" && db in DB_PROBLEM_HELP ? DB_PROBLEM_HELP[db as DbProblem] : null;
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Sign in to continue where you left off.</p>
      {problem ? <Notice tone="danger" className="mb-4" title="The database isn't ready">{problem}</Notice> : null}
      <AuthForm mode="sign-in" action={signInAction} />
      <p className="mt-6 text-sm text-muted">
        New here?{" "}
        <Link href="/sign-up" className="font-semibold text-primary underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
      {demo ? (
        <form action={startDemoAction} className="mt-8 border-t border-border pt-6">
          <Button variant="secondary" className="w-full">Explore with sample data</Button>
          <p className="mt-2 text-xs text-subtle">Creates a separate demo account filled with clearly labelled sample data. Nothing is shared with a real account.</p>
        </form>
      ) : null}
    </div>
  );
}
