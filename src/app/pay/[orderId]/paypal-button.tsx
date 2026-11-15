"use client";

import { useState } from "react";
import { MessagePopup } from "@/components/message-popup";
import { CTA_PAYPAL } from "./pay-ui";

/** The three strings this button says, resolved for the guest's language
 *  by `page.tsx` (P7-16: a client component never imports a five-locale
 *  catalogue). */
export interface PayPalButtonLabels {
  pay: string;
  opening: string;
  failed: string;
}

/** Starts the PayPal approve flow — the guest bounces to PayPal (or the
 *  fake's instant return leg in dev) and lands back here settled. */
export function PayPalButton({
  orderId,
  token,
  appReturnUrl,
  labels,
}: {
  orderId: string;
  token: string;
  appReturnUrl?: string | null;
  labels: PayPalButtonLabels;
}): React.ReactElement {
  const [state, setState] = useState<"idle" | "starting" | "error">("idle");

  return (
    <div>
      <button
        type="button"
        disabled={state === "starting"}
        onClick={async () => {
          setState("starting");
          try {
            const res = await fetch(`/api/orders/${orderId}/pay/paypal`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, ...(appReturnUrl ? { app: appReturnUrl } : {}) }),
            });
            const body = (await res.json()) as { url?: string; error?: string };
            if (res.ok && body.url) {
              location.href = body.url;
              return;
            }
            // The card page opened earlier turned out to be paid: show it.
            if (body.error === "already_paid") {
              location.reload();
              return;
            }
            setState("error");
          } catch {
            setState("error");
          }
        }}
        className={CTA_PAYPAL}
      >
        {state === "starting" ? labels.opening : labels.pay}
      </button>
      {state === "error" ? <MessagePopup kind="error" text={labels.failed} /> : null}
    </div>
  );
}
