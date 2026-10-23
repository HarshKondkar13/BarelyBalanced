"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { createTaskAction } from "@/app/(app)/_actions/schedule";

export function AddTask({ date, suggestedSlot }: { date: string | null; suggestedSlot?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-dashed border-border-strong px-3 text-sm font-medium text-muted hover:text-text">
        <Plus size={16} aria-hidden /> Add a task
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <ActionForm action={createTaskAction} submitLabel="Add task" resetOnSuccess className="space-y-3">
        <Field label="Task" htmlFor="title"><Input id="title" name="title" autoFocus required placeholder="What needs doing?" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Day" htmlFor="planDate"><Input id="planDate" name="planDate" type="date" defaultValue={date ?? ""} /></Field>
          <Field label="Start" htmlFor="startTime" hint={suggestedSlot ? `Free from ${suggestedSlot}` : "Optional"}><Input id="startTime" name="startTime" type="time" step={900} /></Field>
          <Field label="Minutes" htmlFor="durationMin"><Input id="durationMin" name="durationMin" type="number" min={5} max={600} step={5} defaultValue={30} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue="task">
              <option value="task">Task</option>
              <option value="money_review">Money review</option>
              <option value="bill">Pay a bill</option>
              <option value="budget_setup">Budget setup</option>
              <option value="briefing">Read briefing</option>
              <option value="plan_review">Investment plan review</option>
              <option value="focus">Focus block</option>
            </Select>
          </Field>
          <Field label="Deadline" htmlFor="deadline"><Input id="deadline" name="deadline" type="date" /></Field>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="isTopPriority" className="size-5 accent-[var(--primary)]" /> Top priority (max 3 a day)</label>
      </ActionForm>
      <button type="button" className="mt-2 min-h-9 text-sm text-muted" onClick={() => setOpen(false)}>Close</button>
    </div>
  );
}
