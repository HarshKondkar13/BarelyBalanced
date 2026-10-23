"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { toast } from "@/components/toast";
import { deleteAccountAction } from "@/app/(app)/_actions/settings";

export function DeleteAccount() {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <label htmlFor="del" className="text-sm">Type <strong>DELETE</strong> to permanently delete your account and all data.</label>
      <div className="flex gap-2">
        <Input id="del" value={text} onChange={(e) => setText(e.target.value)} className="max-w-40" autoComplete="off" />
        <Button variant="danger" disabled={pending || text !== "DELETE"} onClick={() => start(async () => { const r = await deleteAccountAction(text); if (r && !r.ok) toast(r); })}>Delete everything</Button>
      </div>
    </div>
  );
}
