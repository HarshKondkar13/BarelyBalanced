"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { toast } from "@/components/toast";
import { disconnectCalendarAction, setSelectedCalendarsAction } from "@/app/(app)/_actions/integrations";

export function CalendarPicker({ calendars, selected }: { calendars: Array<{ id: string; summary: string; primary?: boolean }>; selected: string[] }) {
  const [sel, setSel] = useState(new Set(selected.length ? selected : calendars.filter((c) => c.primary).map((c) => c.id)));
  const [pending, start] = useTransition();
  return (
    <div>
      <ul className="space-y-1">
        {calendars.map((c) => (
          <li key={c.id}>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={sel.has(c.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
              {c.summary}{c.primary ? " (primary)" : ""}
            </label>
          </li>
        ))}
      </ul>
      <Button size="sm" className="mt-2" disabled={pending} onClick={() => start(async () => toast(await setSelectedCalendarsAction([...sel])))}>Save selection</Button>
    </div>
  );
}

export function DisconnectCalendar({ hasPublished }: { hasPublished: boolean }) {
  const [del, setDel] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      {hasPublished ? (
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={del} onChange={(e) => setDel(e.target.checked)} />
          <span>Also delete the time blocks this app published<span className="block text-xs text-muted">If unchecked, they stay in your Google Calendar (on the app&apos;s own calendar) and you can delete that calendar yourself anytime.</span></span>
        </label>
      ) : null}
      <Button variant="danger" size="sm" disabled={pending} onClick={() => { if (window.confirm("Disconnect Google Calendar? Access will be revoked and stored credentials erased.")) start(async () => toast(await disconnectCalendarAction(del))); }}>Disconnect</Button>
    </div>
  );
}
