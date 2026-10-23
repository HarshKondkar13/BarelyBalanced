import Link from "next/link";
import { AuthForm } from "../auth-form";
import { signUpAction } from "../actions";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Your data stays private to your account. No bank logins are ever requested.</p>
      <AuthForm mode="sign-up" action={signUpAction} />
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-primary underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
