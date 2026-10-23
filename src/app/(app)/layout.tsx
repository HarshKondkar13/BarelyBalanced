import Link from "next/link";
import { Bell, Settings, Trophy } from "lucide-react";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { BottomNav, SideNav } from "@/components/app-nav";
import { Toaster } from "@/components/toast";
import { Logo } from "@/components/logo";
import { brand } from "@/lib/brand";
import { getContext } from "@/server/context";
import { xpSummary } from "@/server/xp";
import { notifications } from "@/db/schema";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, prefs, db } = await getContext();
  const xp = prefs?.gamification === "off" ? null : await xpSummary(db, user.id);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt), lte(notifications.deliverAfter, new Date())));

  return (
    <div className="min-h-dvh">
      {user.isDemo ? (
        <div className="sticky top-0 z-40 bg-accent px-4 py-1.5 text-center text-xs font-semibold text-white" role="status">
          Demo mode · all figures are sample data ·{" "}
          <Link href="/settings/data" className="underline">
            start your own account
          </Link>
        </div>
      ) : null}
      <div className="mx-auto flex max-w-6xl gap-8 md:px-6">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col py-6 md:flex">
          <Link href="/today" className="mb-8 flex items-center gap-2 px-3 font-semibold">
            <Logo /> <span className="truncate">{brand.name}</span>
          </Link>
          <SideNav />
          <div className="mt-auto space-y-1 text-sm">
            <Link href="/progress" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted hover:bg-surface-2 hover:text-text">
              <Trophy size={20} aria-hidden /> Progress
            </Link>
            <Link href="/settings" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted hover:bg-surface-2 hover:text-text">
              <Settings size={20} aria-hidden /> Settings
            </Link>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between px-4 pb-1 pt-4 md:px-0">
            <Link href="/today" className="flex items-center gap-2 font-semibold md:invisible" aria-label={`${brand.name} home`}>
              <Logo size={26} />
              <span className="text-[15px]">{brand.shortName}</span>
            </Link>
            <div className="flex items-center gap-1">
              {xp ? (
                <Link href="/progress" className="mr-1 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-semibold shadow-[var(--shadow)]" aria-label={`Level ${xp.level}, ${xp.total} XP. View progress`}>
                  <Trophy size={14} className="text-accent" aria-hidden /> Lv {xp.level}
                </Link>
              ) : null}
              <Link href="/notifications" className="relative inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
                <Bell size={20} aria-hidden />
                {unread ? <span className="absolute right-2 top-2 size-2 rounded-full bg-danger" aria-hidden /> : null}
              </Link>
              <Link href="/settings" className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text md:hidden" aria-label="Settings">
                <Settings size={20} aria-hidden />
              </Link>
            </div>
          </header>
          <main id="main" className="px-4 pb-28 pt-2 md:px-0 md:pb-12">
            {children}
          </main>
        </div>
      </div>
      <BottomNav />
      <Toaster />
    </div>
  );
}
