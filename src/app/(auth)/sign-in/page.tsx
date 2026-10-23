import Link from "next/link";
import { AuthForm } from "../auth-form";
import { signInAction, startDemoAction } from "../actions";
import { Button } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  const demo = process.env.DEMO_MODE_ENABLED === "true";
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Sign in to continue where you left off.</p>
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
