"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, Compass, Newspaper, Sun, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/plan", label: "Plan", icon: Compass },
  { href: "/signals", label: "Signals", icon: Newspaper },
  { href: "/schedule", label: "Schedule", icon: CalendarClock },
] as const;

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-primary" : "text-muted hover:text-text")}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="space-y-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium", active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-text")}
              >
                <Icon size={20} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
