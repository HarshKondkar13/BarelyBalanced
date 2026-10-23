"use client";

import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import type { AuthState } from "./actions";

export function AuthForm({ mode, action }: { mode: "sign-in" | "sign-up"; action: (s: AuthState, f: FormData) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {mode === "sign-up" ? (
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
      ) : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === "sign-up" ? "At least 10 characters." : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={mode === "sign-up" ? 10 : 1} />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}
