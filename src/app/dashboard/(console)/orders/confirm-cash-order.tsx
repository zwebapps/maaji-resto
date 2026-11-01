"use client";

import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmit } from "@/components/confirm-submit";

const STEP = 5;
const MIN = 5;
const MAX = 180;

/**
 * A cash order waiting for its confirmation call (owner, 2026-11-01): the
 * guest's number to tap, then Accept — with the same − / + time as every
 * accept, but no countdown: the call takes as long as it takes, and the
 * time counts from the moment of accepting — or Reject, which asks first
 * (the guest gets a "could not be accepted" email).
 *
 * A planned order (`timed` false) has no time to set: Accept just
 * confirms it, and the guest's own time stands.
 */
export function ConfirmCashOrder({
  orderId,
  label,
  orderType,
  phone,
  timed,
  defaultMinutes,
  timezone,
  acceptAction,
  rejectAction,
}: {
  orderId: string;
  /** "B-12" — named in the reject dialog so a mis-tap shows. */
  label: string;
  orderType: string;
  phone: string | null;
  timed: boolean;
  defaultMinutes: number;
  timezone: string;
  acceptAction: (form: FormData) => void | Promise<void>;
  rejectAction: (form: FormData) => void | Promise<void>;
}): React.ReactElement {
  const [minutes, setMinutes] = useState(defaultMinutes);
  // The time counts from the moment of accepting, so "around …" follows
  // the clock. Read after mount (the server's render has no "now" to
  // agree with) and refreshed while the card waits for its call.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = (): void => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);
  const at =
    now === null
      ? null
      : new Intl.DateTimeFormat("de-DE", { timeStyle: "short", timeZone: timezone }).format(
          new Date(now + minutes * 60_000),
        );
  const step =
    "flex h-11 w-11 shrink-0 items-center justify-center bg-[#b3261e] text-2xl font-bold leading-none text-white hover:bg-[#8f1e18] disabled:opacity-40";

  return (
    <div className="mt-3 w-full border border-[#b3261e]/40 bg-white/70 p-3">
      {phone ? (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
          className="flex items-center justify-center gap-2 border border-[#b3261e] px-3 py-2 text-base font-semibold text-[#b3261e] hover:bg-[#b3261e]/5"
        >
          <Phone className="h-4 w-4" aria-hidden />
          Call {phone}
        </a>
      ) : null}

      <form action={acceptAction} className="mt-3">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="minutes" value={minutes} />
        {timed ? (
          <>
            <p className="text-xs font-medium">
              {orderType === "delivery" ? "Delivery time" : "Pickup time"} after the call
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setMinutes((m) => Math.max(MIN, m - STEP))}
                disabled={minutes <= MIN}
                aria-label="5 minutes less"
                className={step}
              >
                −
              </button>
              <p className="text-center" aria-live="polite">
                <span className="block text-2xl font-semibold tabular-nums">{minutes} min</span>
                {at ? <span className="block text-xs text-muted">around {at}</span> : null}
              </p>
              <button
                type="button"
                onClick={() => setMinutes((m) => Math.min(MAX, m + STEP))}
                disabled={minutes >= MAX}
                aria-label="5 minutes more"
                className={step}
              >
                +
              </button>
            </div>
          </>
        ) : null}
        <SubmitButton
          pendingLabel="Accepting…"
          className="mt-3 w-full bg-[#2f6b3a] px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-[#245530]"
        >
          {timed ? `Accept · ${minutes} min` : "Accept order"}
        </SubmitButton>
      </form>

      <form action={rejectAction} className="mt-2">
        <input type="hidden" name="orderId" value={orderId} />
        <ConfirmSubmit
          message={`Reject order #${label}? The guest gets an email that it could not be accepted.`}
          confirmLabel="Reject order"
          pendingLabel="Rejecting…"
          className="w-full border border-[#b3261e] px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#b3261e] hover:bg-[#b3261e]/5"
        >
          Reject
        </ConfirmSubmit>
      </form>
    </div>
  );
}
