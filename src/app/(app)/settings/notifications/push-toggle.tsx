"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { toast } from "@/components/toast";

/** Asks for browser notification permission ONLY when the user clicks enable. */
export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<"unsupported" | "default" | "granted" | "denied" | "subscribed">(() =>
    typeof window !== "undefined" && (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) ? "unsupported" : "default",
  );
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "subscribed" : (Notification.permission as "default" | "granted" | "denied"));
    });
  }, []);
  if (!vapidKey) return <p className="text-xs text-muted">Browser push is not configured on this server (VAPID keys). In-app notifications still work.</p>;
  if (state === "unsupported") return <p className="text-xs text-muted">This browser doesn&apos;t support web push. On iPhone, add the app to your Home Screen first (iOS 16.4+).</p>;
  if (state === "denied") return <p className="text-xs text-muted">Notifications are blocked for this site in your browser settings.</p>;
  if (state === "subscribed")
    return (
      <Button size="sm" variant="secondary" onClick={async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) { await fetch("/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
        setState("default");
        toast({ ok: true, message: "Push turned off on this device" });
      }}>Turn off push on this device</Button>
    );
  return (
    <Button size="sm" onClick={async () => {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm as "default" | "denied");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey });
      const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      if (r.ok) { setState("subscribed"); toast({ ok: true, message: "Push enabled on this device" }); }
      else toast({ ok: false, error: "Could not save the subscription" });
    }}>Enable push on this device</Button>
  );
}
