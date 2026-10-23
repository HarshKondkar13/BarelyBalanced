"use client";

import { useState, useTransition } from "react";
import { Button, Textarea } from "@/components/ui";
import { toast } from "@/components/toast";
import { explainStoryAction } from "@/app/(app)/_actions/signals";

export function ExplainForm({ newsId, initial }: { newsId: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? "");
  const [pending, start] = useTransition();
  return (
    <div>
      <label htmlFor="explain" className="text-sm font-semibold">In one or two lines, why does this matter?</label>
      <p className="text-xs text-muted">Explaining in your own words is the fastest way to learn. Saved privately with the story.</p>
      <Textarea id="explain" rows={3} className="mt-2" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      <Button className="mt-2" size="sm" disabled={pending || text.trim().length < 20} onClick={() => start(async () => toast(await explainStoryAction(newsId, text)))}>Save my explanation</Button>
    </div>
  );
}
