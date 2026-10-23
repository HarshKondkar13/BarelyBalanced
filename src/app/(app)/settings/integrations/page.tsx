import { and, asc, eq, gte } from "drizzle-orm";
import { getContext } from "@/server/context";
import { getIntegration, googleConfigured, previewPublish, redirectUri, type CalendarSettings } from "@/server/integrations/google-calendar";
import { tasks, calendarPublications } from "@/db/schema";
import { SCOPES } from "@/lib/integrations/calendar";
import { formatShortDate, formatTime12, relativeDayLabel, toLocalDate, toLocalTime } from "@/lib/dates";
import { Badge, ButtonLink, Card, CardHeader, Notice, PageHeader, SubNav } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { applyPublishAction, setTaskPublishAction, syncCalendarNowAction } from "@/app/(app)/_actions/integrations";
import { SETTINGS_TABS } from "../tabs";
import { CalendarPicker, DisconnectCalendar } from "./calendar-controls";

export const metadata = { title: "Integrations" };

const ERRORS: Record<string, string> = {
  denied: "You declined access in Google. Nothing was connected.",
  state: "The connection request expired or didn't match. Please try again.",
  exchange: "Google didn't complete the connection. Please try again.",
  oauth: "Google returned an error. Please try again.",
  not_configured: "Google credentials aren't configured on this server.",
};

export default async function IntegrationsPage({ searchParams }: PageProps<"/settings/integrations">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const configured = googleConfigured();
  const row = await getIntegration(ctx.db, ctx.user.id);
  const connected = row?.status === "connected";
  const settings = (row?.settings ?? {}) as CalendarSettings;
  const canPublish = connected && row!.scopes.includes(SCOPES.publish);
  const plan = canPublish ? await previewPublish(ctx.db, ctx.user.id, ctx.tz, ctx.today) : null;
  const upcoming = connected ? await ctx.db.select().from(tasks).where(and(eq(tasks.userId, ctx.user.id), gte(tasks.planDate, ctx.today), eq(tasks.status, "todo"))).orderBy(asc(tasks.planDate)).limit(20) : [];
  const pubCount = connected ? (await ctx.db.select({ id: calendarPublications.id }).from(calendarPublications).where(and(eq(calendarPublications.userId, ctx.user.id), eq(calendarPublications.status, "published")))).length : 0;
  const err = typeof sp.error === "string" ? ERRORS[sp.error] : null;

  return (
    <>
      <PageHeader title="Integrations" />
      <SubNav items={SETTINGS_TABS} active="/settings/integrations" />
      {sp.connected ? <Notice tone="positive" className="mb-4">Google Calendar connected.</Notice> : null}
      {err ? <Notice tone="danger" className="mb-4">{err}</Notice> : null}
      <Card>
        <CardHeader
          title="Google Calendar"
          subtitle="See your events alongside tasks; optionally publish chosen time blocks"
          action={!configured ? <Badge>Awaiting credentials</Badge> : connected ? <Badge tone="positive">Connected</Badge> : row?.status === "revoked" ? <Badge tone="danger">Access revoked</Badge> : <Badge>Not connected</Badge>}
        />
        {!configured ? (
          <div className="space-y-2 text-sm">
            <Notice tone="neutral" title="Not connected: Google OAuth credentials are not configured">Nothing is being synced. This is the honest disconnected state, not a simulation.</Notice>
            <details>
              <summary className="min-h-9 font-semibold text-primary">Setup steps (for the person hosting the app)</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
                <li>In Google Cloud Console, create a project and enable the <strong>Google Calendar API</strong>.</li>
                <li>Configure the OAuth consent screen (External; add yourself as a test user while in testing).</li>
                <li>Add scopes <code>calendar.readonly</code> and <code>calendar.app.created</code>.</li>
                <li>Create an OAuth client ID (Web application) with redirect URI <code className="break-all">{redirectUri()}</code>.</li>
                <li>Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env</code> and restart.</li>
              </ol>
              <p className="mt-2 text-xs text-subtle">Note: apps left in &ldquo;Testing&rdquo; status get refresh tokens that Google expires after 7 days; you would need to reconnect weekly until the app is published/verified.</p>
            </details>
          </div>
        ) : !connected ? (
          <div className="space-y-3 text-sm">
            {row?.status === "revoked" ? <Notice tone="danger">{row.lastError ?? "Access was revoked."} Previously published events remain in Google Calendar.</Notice> : null}
            <p className="text-muted">Step 1 asks for <strong>read-only</strong> access to your calendars. Publishing is a separate, optional step later.</p>
            <ButtonLink href="/api/integrations/google/connect?mode=read" prefetch={false}>Connect Google Calendar (read-only)</ButtonLink>
          </div>
        ) : (
          <div className="space-y-5 text-sm">
            <div>
              <p className="text-muted">
                Last sync: {row!.lastSyncAt ? `${relativeDayLabel(toLocalDate(row!.lastSyncAt, ctx.tz), ctx.today)} ${formatTime12(toLocalTime(row!.lastSyncAt, ctx.tz))}` : "never"}. Syncs every 30 minutes when the background worker is running.
              </p>
              {row!.lastError ? <Notice tone="attention" className="mt-2">{row!.lastError}</Notice> : null}
              <div className="mt-2"><ActionButton action={syncCalendarNowAction}>Sync now</ActionButton></div>
            </div>
            <div>
              <h3 className="font-semibold">Calendars to read</h3>
              {settings.calendars?.length ? <CalendarPicker calendars={settings.calendars.filter((c) => c.id !== settings.appCalendarId)} selected={settings.selectedCalendarIds ?? []} /> : <p className="text-muted">Run a sync to load your calendar list.</p>}
            </div>
            <div>
              <h3 className="font-semibold">Publishing time blocks</h3>
              {!canPublish ? (
                <>
                  <p className="text-muted">Optional. Grants access to create one dedicated calendar and manage events <strong>only on calendars this app creates</strong>. It cannot edit or delete your other events.</p>
                  <ButtonLink href="/api/integrations/google/connect?mode=publish" variant="secondary" size="sm" className="mt-2" prefetch={false}>Enable publishing</ButtonLink>
                </>
              ) : (
                <>
                  <p className="text-muted">Choose tasks to publish, preview the changes, then apply. Re-applying never creates duplicates (each task maps to one fixed event ID).</p>
                  <ul className="mt-2 divide-y divide-border">
                    {upcoming.map((t) => (
                      <li key={t.id} className="flex min-h-11 items-center justify-between gap-2 py-1.5">
                        <span className="truncate">{t.title} <span className="text-xs text-subtle">· {formatShortDate(t.planDate!)} {t.startTime ? formatTime12(t.startTime) : "all day"}</span></span>
                        <ActionButton action={setTaskPublishAction.bind(null, t.id, !t.publishToCalendar)} variant={t.publishToCalendar ? "soft" : "ghost"}>{t.publishToCalendar ? "Publishing" : "Publish"}</ActionButton>
                      </li>
                    ))}
                  </ul>
                  {plan ? (
                    <div className="mt-3 rounded-xl bg-surface-2 p-3">
                      <p className="font-semibold">Preview</p>
                      <p className="text-muted">{plan.create.length} to create · {plan.update.length} to update · {plan.remove.length} to remove · {plan.unchanged} unchanged</p>
                      <ul className="mt-1 text-xs text-muted">
                        {plan.create.map((c) => <li key={c.task.id}>+ {c.task.title}</li>)}
                        {plan.update.map((c) => <li key={c.task.id}>~ {c.task.title}</li>)}
                        {plan.remove.map((r) => <li key={r.taskId}>− event for a task ({r.reason})</li>)}
                      </ul>
                      {plan.create.length + plan.update.length + plan.remove.length ? <div className="mt-2"><ActionButton action={applyPublishAction} variant="primary">Apply these changes</ActionButton></div> : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <details>
              <summary className="min-h-9 font-semibold text-primary">How conflicts and deletions work</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                <li>External events are read-only here. Overlaps with your tasks are flagged on the Schedule; nothing is moved automatically.</li>
                <li>The app only writes to its own calendar (&ldquo;time blocks&rdquo;). It never modifies or deletes your other events.</li>
                <li>If you edit a published event in Google, the next publish overwrites it with the task&apos;s details. The task is the source of truth.</li>
                <li>Deleting or unpublishing a task removes its event on the next publish.</li>
                <li>Disconnecting revokes access and erases tokens. You choose whether published events are deleted or left in place.</li>
              </ul>
            </details>
            <div>
              <h3 className="font-semibold">Disconnect</h3>
              <DisconnectCalendar hasPublished={pubCount > 0} />
            </div>
          </div>
        )}
      </Card>
      <Card className="mt-4">
        <CardHeader title="Banks" subtitle="Deliberately not supported" />
        <p className="text-sm text-muted">The app never asks for bank logins and never connects to bank accounts. Use manual entry or CSV statements you download yourself.</p>
      </Card>
    </>
  );
}
