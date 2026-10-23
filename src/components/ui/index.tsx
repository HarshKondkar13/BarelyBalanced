import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatINR, formatINRCompact } from "@/lib/money";

/* ---------------- Buttons ---------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary: "bg-surface text-text border border-border-strong hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
  soft: "bg-primary-soft text-primary hover:brightness-95",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-11 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none select-none";

export function Button({ variant = "primary", className, size, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button className={cn(base, variants[variant], size === "sm" && "min-h-9 px-3 text-[13px]", className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, size, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" }) {
  return <Link className={cn(base, variants[variant], size === "sm" && "min-h-9 px-3 text-[13px]", className)} {...props} />;
}

/* ---------------- Surfaces ---------------- */

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[var(--radius)] border border-border bg-surface p-4 shadow-[var(--shadow)]", className)} {...props} />;
}

export function CardHeader({ title, subtitle, action, as: Tag = "h2" }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Tag className="text-[15px] font-semibold leading-tight">{title}</Tag>
        {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-medium uppercase tracking-wide text-subtle">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

/* ---------------- Badges ---------------- */

const tones = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary-soft text-primary",
  positive: "bg-positive-soft text-positive",
  attention: "bg-attention-soft text-attention",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}

/* ---------------- Forms ---------------- */

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full min-h-11 rounded-xl border border-border-strong bg-surface px-3 text-[15px] text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputCls, className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputCls, "pr-8", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputCls, "py-2", className)} {...props} />;
}

/* ---------------- Data display ---------------- */

export function Money({ paise, className, compact, signed, whole = true }: { paise: number; className?: string; compact?: boolean; signed?: boolean; whole?: boolean }) {
  return <span className={cn("num", className)}>{compact ? formatINRCompact(paise) : formatINR(paise, { whole, signed })}</span>;
}

export function Progress({ value, tone = "primary", label, className }: { value: number; tone?: "primary" | "positive" | "attention" | "danger"; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const color = { primary: "bg-primary", positive: "bg-positive", attention: "bg-attention", danger: "bg-danger" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-0.5 truncate text-xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: ReactNode; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius)] border border-dashed border-border-strong px-6 py-8 text-center">
      {icon ? <div className="mb-2 text-subtle">{icon}</div> : null}
      <p className="font-semibold">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl px-3 py-2.5 text-sm", tones[tone], className)} role="note">
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
    </div>
  );
}

/** Plain-language explanation shown beside a metric. Uses native <details> for keyboard + no-JS support. */
export function Explain({ summary = "What does this mean?", children }: { summary?: ReactNode; children: ReactNode }) {
  return (
    <details className="group mt-2 text-sm">
      <summary className="inline-flex min-h-8 items-center gap-1 text-[13px] font-medium text-primary">
        <span className="chev inline-block transition-transform" aria-hidden>
          ›
        </span>
        {summary}
      </summary>
      <div className="mt-1.5 rounded-lg bg-surface-2 p-3 text-[13px] leading-relaxed text-muted">{children}</div>
    </details>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">{children}</h2>
      {action}
    </div>
  );
}

export function SubNav({ items, active }: { items: Array<{ href: string; label: string }>; active: string }) {
  return (
    <nav aria-label="Section" className="-mx-4 mb-4 overflow-x-auto px-4">
      <ul className="flex gap-1.5">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={active === i.href ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium",
                active === i.href ? "bg-text text-bg" : "bg-surface text-muted border border-border hover:text-text",
              )}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
