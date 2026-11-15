"use client";

import { useState } from "react";
import { MessagePopup } from "@/components/message-popup";
import { CTA_PAY, SOFT_TEXT } from "./pay-ui";

/** The four strings this button says, resolved for the guest's language
 *  by `page.tsx` (P7-16: a client component never imports a five-locale
 *  catalogue). `pay` arrives with the amount already interpolated. */
export interface PayButtonLabels {
  pay: string;
  processing: string;
  failed: string;
  testNote: string;
}

/** Dev/fake-provider pay button — settles the checkout like Stripe's
 *  hosted page + webhook would in production. */
export function PayButton({
  orderId,
  token,
  payRef,
  labels,
}: {
  orderId: string;
  token: string;
  payRef: string;
  labels: PayButtonLabels;
}): React.ReactElement {
  const [state, setState] = useState<"idle" | "paying" | "error">("idle");

  return (
    <div>
      <button
        type="button"
        disabled={state === "paying"}
        onClick={async () => {
          setState("paying");
          try {
            const res = await fetch(`/api/orders/${orderId}/pay/confirm`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, ref: payRef }),
            });
            // 409 / 404 = this checkout did not settle or no longer exists —
            // typically because the order was paid or switched to cash in
            // another tab and this card page was closed. Reload so the page
            // shows where the order really stands ("Bezahlt ✓", "bar")
            // instead of a "try again" that invites a second payment.
            if (!res.ok && res.status !== 409 && res.status !== 404) {
              throw new Error(String(res.status));
            }
            location.reload();
          } catch {
            setState("error");
          }
        }}
        className={CTA_PAY}
      >
        {state === "paying" ? labels.processing : labels.pay}
      </button>
      {state === "error" ? <MessagePopup kind="error" text={labels.failed} /> : null}
      <p
        className={`mt-2 text-center text-[11px] uppercase tracking-[0.2em] rtl:normal-case rtl:tracking-normal ${SOFT_TEXT}`}
      >
        {labels.testNote}
      </p>
    </div>
  );
}
