import Link from "next/link";
import { and, desc, eq, lte } from "drizzle-orm";
import { getContext } from "@/server/context";
import { notifications } from "@/db/schema";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { markAllReadAction } from "@/app/(app)/_actions/notifications";
import { formatTime12, relativeDayLabel, toLocalDate, toLocalTime } from "@/lib/dates";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { db, user, tz, today } = await getContext();
  const rows = await db.select().from(notifications).where(and(eq(notifications.userId, user.id), lte(notifications.deliverAfter, new Date()))).orderBy(desc(notifications.createdAt)).limit(50);
  return (
    <>
      <PageHeader title="Notifications" action={rows.some((r) => !r.readAt) ? <ActionButton action={markAllReadAction}>Mark all read</ActionButton> : undefined} />
      {rows.length === 0 ? <EmptyState title="Nothing here" body="Bill reminders and weekly review nudges appear here. Adjust them in Settings → Notifications." /> : (
        <Card className="py-1">
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id}>
                <Link href={n.href ?? "/today"} className="flex min-h-14 items-start gap-3 py-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} aria-label={n.readAt ? undefined : "Unread"} />
                  <span className="min-w-0">
                    <span className="block font-medium">{n.title}</span>
                    <span className="block text-sm text-muted">{n.body}</span>
                    <span className="text-xs text-subtle">{relativeDayLabel(toLocalDate(n.createdAt, tz), today)} · {formatTime12(toLocalTime(n.createdAt, tz))}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-3 text-xs text-subtle">Notifications are created by the background worker and respect quiet hours and your daily limit. <Link href="/settings/notifications" className="underline">Preferences</Link></p>
    </>
  );
}
