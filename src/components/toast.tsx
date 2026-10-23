"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

type ToastMsg = { id: number; text: string; xp?: number; tone: "ok" | "error" };
type Result = { ok: true; message?: string; xp?: number } | { ok: false; error: string };

export function toast(result: Result | { ok: true; message?: string; xp?: number }) {
  if (typeof window === "undefined") return;
  const detail: Omit<ToastMsg, "id"> = result.ok
    ? { text: result.message ?? "Saved", xp: result.xp, tone: "ok" }
    : { text: result.error, tone: "error" };
  window.dispatchEvent(new CustomEvent("pp-toast", { detail }));
}

/** Polite live region so screen readers hear outcomes; XP gains get a small, quiet celebration. */
export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<Omit<ToastMsg, "id">>).detail;
      const id = ++n;
      setItems((xs) => [...xs.slice(-2), { ...d, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), d.tone === "error" ? 6000 : 3200);
    };
    window.addEventListener("pp-toast", onToast);
    return () => window.removeEventListener("pp-toast", onToast);
  }, []);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-rise pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg",
            t.tone === "error" ? "bg-danger text-white" : "bg-text text-bg",
          )}
        >
          <span>{t.text}</span>
          {t.xp && t.xp > 0 ? (
            <span className="animate-pop inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">
              <Sparkles size={12} aria-hidden /> +{t.xp} XP
            </span>
          ) : null}
          {t.xp && t.xp < 0 ? <span className="text-xs opacity-80">{t.xp} XP (undone)</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Button that runs a server action and reports the outcome. Disabled while pending to block double-submits. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "sm",
  className,
  confirm,
  label,
}: {
  action: () => Promise<Result>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft";
  size?: "sm" | "md";
  className?: string;
  confirm?: string;
  label?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      aria-label={label}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => toast(await action()));
      }}
    >
      {children}
    </Button>
  );
}
