"use client";

import { useEffect, useRef, useState } from "react";
import { CTA_DANGER, CTA_LINK, CTA_PAY, CTA_SECONDARY, SOFT_TEXT } from "./pay-ui";

/** Words for the dialog, resolved for the guest's language by `page.tsx`
 *  (a client component never imports the whole catalogue). */
export interface PaymentExitLabels {
  title: string;
  body: string;
  tryCard: string;
  /** Under "try card again": the guest is about to leave for Stripe. */
  keepWindowOpen: string;
  payCash: string;
  cancel: string;
  cancelConfirm: string;
  working: string;
  stillProcessing: string;
  alreadyPaid: string;
  failed: string;
  close: string;
  otherOptions: string;
}

type Choice = "card" | "cash" | "cancel";

/**
 * "Payment not completed" — the guest's way forward when a card or PayPal
 * payment failed, was declined or was abandoned: try the card again, pay
 * cash at the restaurant (which sends the order to the kitchen), or cancel.
 *
 * A native <dialog>, opened automatically when the guest has just come
 * back from a failed / cancelled payment, and re-openable from the page.
 * Every choice is decided by the SERVER (`/pay-cash`, `/cancel`, `/pay`),
 * which re-checks the order and the gateway; this is only the UI.
 */
export function PaymentExit({
  orderId,
  token,
  acceptsCash,
  cardAvailable,
  autoOpen,
  labels,
}: {
  orderId: string;
  token: string;
  acceptsCash: boolean;
  cardAvailable: boolean;
  autoOpen: boolean;
  labels: PaymentExitLabels;
}): React.ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<Choice | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Cancelling asks once more — inside this dialog, never a native one. */
  const [askCancel, setAskCancel] = useState(false);

  useEffect(() => {
    if (autoOpen && ref.current && !ref.current.open) ref.current.showModal();
  }, [autoOpen]);

  async function act(choice: Choice): Promise<void> {
    setBusy(choice);
    setMessage(null);
    const url =
      choice === "card"
        ? `/api/orders/${encodeURIComponent(orderId)}/pay`
        : `/api/v1/orders/${encodeURIComponent(orderId)}/${choice === "cash" ? "pay-cash" : "cancel"}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.ok && choice === "card" && body?.url) {
        location.href = body.url;
        return;
      }
      if (res.ok) {
        // Cash or cancelled: the page re-renders the new state.
        location.reload();
        return;
      }
      setMessage(
        body?.error === "processing"
          ? labels.stillProcessing
          : body?.error === "already_paid"
            ? labels.alreadyPaid
            : labels.failed,
      );
      if (body?.error === "already_paid") location.reload();
    } catch {
      setMessage(labels.failed);
    }
    setBusy(null);
  }

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={CTA_LINK}>
        {labels.otherOptions}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="payment-exit-title"
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-[var(--menu-surface-text,var(--menu-text))]/10 bg-[var(--menu-surface)] p-0 text-[var(--menu-surface-text,var(--menu-text))] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)] backdrop:bg-black/55"
      >
        <div className="p-6">
          <h2 id="payment-exit-title" className="font-serif text-2xl">
            {labels.title}
          </h2>
          <p className={`mt-2 text-sm ${SOFT_TEXT}`}>{labels.body}</p>
          <div className="mt-5 space-y-3">
            {cardAvailable ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void act("card")}
                className={CTA_PAY}
              >
                {busy === "card" ? labels.working : labels.tryCard}
              </button>
            ) : null}
            {cardAvailable ? (
              <p
                role="status"
                className={"text-center text-xs " + (busy === "card" ? "font-semibold" : SOFT_TEXT)}
              >
                {labels.keepWindowOpen}
              </p>
            ) : null}
            {acceptsCash ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void act("cash")}
                className={CTA_SECONDARY}
              >
                {busy === "cash" ? labels.working : labels.payCash}
              </button>
            ) : null}
            {askCancel ? (
              <div className="rounded-xl border border-[var(--menu-danger)]/40 p-3">
                <p className="text-sm">{labels.cancelConfirm}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void act("cancel")}
                    className={CTA_DANGER}
                  >
                    {busy === "cancel" ? labels.working : labels.cancel}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setAskCancel(false)}
                    className={CTA_SECONDARY}
                  >
                    {labels.close}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setAskCancel(true)}
                className={CTA_DANGER}
              >
                {labels.cancel}
              </button>
            )}
          </div>
          {message ? (
            <p role="alert" className="mt-4 text-sm text-[var(--menu-danger)]">
              {message}
            </p>
          ) : null}
          <button type="button" onClick={() => ref.current?.close()} className={`mt-4 ${CTA_LINK}`}>
            {labels.close}
          </button>
        </div>
      </dialog>
    </>
  );
}
