"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useConfirm } from "@/lib/confirm";
import { fetchMyBookings } from "@/lib/api";
import { lifecycleOf } from "@/lib/booking";

/**
 * When a signed-in guest opens the site, this checks their bookings and — if
 * one has reached its check-in time but the host hasn't checked them in yet
 * (an "awaiting check-in" stay) — pops up a reminder. Shown at most once per
 * booking per browser session, so it nudges without nagging. Renders nothing.
 */
export default function CheckInReminder() {
  const { user, ready } = useAuth();
  const confirm = useConfirm();
  const router = useRouter();
  // Which user we've already run the check for, so it fires once per sign-in.
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !user) {
      checkedFor.current = null;
      return;
    }
    if (checkedFor.current === user.id) return;
    checkedFor.current = user.id;

    let cancelled = false;
    fetchMyBookings()
      .then(async (bookings) => {
        if (cancelled) return;
        const awaiting = bookings.find((b) => lifecycleOf(b) === "awaiting_checkin");
        if (!awaiting) return;
        // Once per booking per session — a page-to-page navigation shouldn't
        // re-open it (sessionStorage clears when the tab closes).
        const key = `checkin-reminder:${awaiting.id}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");

        const hrs = Math.floor(awaiting.hoursLate || 0);
        const when =
          hrs >= 1 ? `about ${hrs} hour${hrs === 1 ? "" : "s"} ago` : "already";
        const ok = await confirm({
          title: "You're not checked in yet",
          message: `Your stay at "${awaiting.villaTitle}" started ${when}, but the host hasn't checked you in. When you're at the property, open this booking — it shows a 4-digit PIN to read out to the host, which is how they check you in.`,
          confirmLabel: "View booking",
          cancelLabel: "Dismiss",
          tone: "primary",
        });
        if (ok && !cancelled) router.push("/settings/bookings");
      })
      .catch(() => {
        // A background reminder must never surface an error of its own.
      });

    return () => {
      cancelled = true;
    };
  }, [ready, user, confirm, router]);

  return null;
}
