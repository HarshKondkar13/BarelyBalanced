import { getContext } from "@/server/context";
import { aiConfigured } from "@/server/ai";
import { savePreferencesAction } from "@/app/(app)/_actions/settings";
import { signOutAction } from "@/app/(auth)/actions";
import { ActionForm } from "@/components/action-form";
import { Button, Card, CardHeader, Field, Input, Notice, PageHeader, Select, SubNav } from "@/components/ui";
import { brand } from "@/lib/brand";
import { SETTINGS_TABS } from "./tabs";

export const metadata = { title: "Settings" };
const TOPICS = { economy: "Indian economy & policy", business: "Business & corporate", banking: "Banking, credit & financial services", markets: "Global markets", technology: "Technology & AI" };

export default async function SettingsPage() {
  const { prefs, user } = await getContext();
  const ai = aiConfigured();
  return (
    <>
      <PageHeader title="Settings" subtitle={user.email.endsWith("@demo.invalid") ? "Demo account" : user.email} action={<form action={signOutAction}><Button variant="secondary" size="sm">Sign out</Button></form>} />
      <SubNav items={SETTINGS_TABS} active="/settings" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Profile & display" />
          <ActionForm action={savePreferencesAction} submitLabel="Save">
            <Field label="Display name" htmlFor="dn"><Input id="dn" name="displayName" defaultValue={prefs?.displayName ?? user.name} /></Field>
            <Field label="Time zone" htmlFor="tz" hint="Used for 'today', reminders and calendar times."><Input id="tz" name="timezone" defaultValue={prefs?.timezone ?? "Asia/Kolkata"} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Theme" htmlFor="th">
                <Select id="th" name="theme" defaultValue={prefs?.theme ?? "system"}><option value="system">Match device</option><option value="light">Light</option><option value="dark">Dark</option></Select>
              </Field>
              <Field label="Week starts" htmlFor="ws">
                <Select id="ws" name="weekStartsOn" defaultValue={String(prefs?.weekStartsOn ?? 1)}><option value="1">Monday</option><option value="0">Sunday</option></Select>
              </Field>
            </div>
            <Field label="Rest days per week (streaks)" htmlFor="rd">
              <Select id="rd" name="restDaysPerWeek" defaultValue={String(prefs?.restDaysPerWeek ?? 1)}><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></Select>
            </Field>
            <p className="text-xs text-subtle">Currency: INR (₹), Indian digit grouping. App name: {brand.name} (configurable via NEXT_PUBLIC_APP_NAME).</p>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Signals topics" subtitle="What appears in your daily briefing" />
          <ActionForm action={savePreferencesAction} submitLabel="Save topics">
            <input type="hidden" name="topicsPresent" value="1" />
            <fieldset className="space-y-1">
              {Object.entries(TOPICS).map(([k, label]) => (
                <label key={k} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="newsTopics" value={k} defaultChecked={(prefs?.newsTopics ?? []).includes(k)} className="size-5 accent-[var(--primary)]" />{label}</label>
              ))}
            </fieldset>
            <Field label="Companies or themes to follow" htmlFor="fe" hint="Comma separated. Matching stories are highlighted when a real provider is connected."><Input id="fe" name="followedEntities" defaultValue={(prefs?.followedEntities ?? []).join(", ")} /></Field>
          </ActionForm>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader title="AI explanations" subtitle="Off by default. Calculated figures never come from AI." />
          {!ai ? <Notice tone="neutral" className="mb-3">No AI provider is configured on this server (ANTHROPIC_API_KEY), so the app uses its built-in deterministic explanations whichever option you choose.</Notice> : null}
          <ActionForm action={savePreferencesAction} submitLabel="Save AI setting">
            <fieldset className="space-y-2 text-sm">
              {[
                ["off", "Off", "Nothing is sent to an AI provider. Insights use built-in plain-language templates."],
                ["explanations", "News explanations only", "Public news headlines and summaries may be sent to generate explainers. None of your financial data is sent."],
                ["aggregates", "News + rephrased insights", "Also sends rounded, anonymised aggregates for an insight (e.g. category name and rounded amounts) to rephrase its explanation. No transaction descriptions, account names or identity details. Numbers shown always come from your ledger."],
              ].map(([v, label, hint]) => (
                <label key={v} className="flex min-h-12 items-start gap-3 rounded-xl border border-border p-3">
                  <input type="radio" name="aiDataUse" value={v} defaultChecked={(prefs?.aiDataUse ?? "off") === v} className="mt-0.5 accent-[var(--primary)]" />
                  <span><span className="font-semibold">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
                </label>
              ))}
            </fieldset>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
