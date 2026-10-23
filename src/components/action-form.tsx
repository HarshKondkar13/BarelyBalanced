"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Button, Notice } from "@/components/ui";
import { toast } from "@/components/toast";

type Result = { ok: true; message?: string; xp?: number } | { ok: false; error: string } | undefined;

/** Progressive-enhancement form: works without JS, shows validation errors and toasts outcomes. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  resetOnSuccess = false,
  submitVariant = "primary",
}: {
  action: (state: Result, form: FormData) => Promise<Result>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  submitVariant?: "primary" | "secondary" | "soft";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      toast(state);
      if (resetOnSuccess) ref.current?.reset();
    }
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className ?? "space-y-4"} noValidate>
      {state && !state.ok ? <Notice tone="danger">{state.error}</Notice> : null}
      {children}
      <Button type="submit" variant={submitVariant} disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
