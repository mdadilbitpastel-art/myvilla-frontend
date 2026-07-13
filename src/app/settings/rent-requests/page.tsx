"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { rentRequests, type RentRequest } from "@/lib/rentRequests";

const COLUMNS = ["Tenant", "Property", "Stay Duration", "No. of Guests", "Status"];

function SortDropdown() {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-[12px] text-body transition-colors hover:border-primary/40"
    >
      Sort: Latest to Oldest
      <ChevronDown size={14} className="text-muted" />
    </button>
  );
}

function RequestRow({ req }: { req: RentRequest }) {
  return (
    <div className="grid grid-cols-[1.4fr_1.2fr_1.1fr_1fr_0.8fr] items-center rounded-lg border border-line px-4 py-3 text-[13px]">
      {/* Tenant */}
      <div className="flex items-center gap-2.5">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-page">
          <Image src={req.avatar} alt={req.tenant} fill sizes="32px" className="object-cover" />
        </div>
        <span className="truncate text-ink">{req.tenant}</span>
      </div>

      <span className="text-body">{req.property}</span>
      <span className="text-body">{req.stay}</span>
      <span className="text-body">
        {req.guests} {req.guests === 1 ? "guest" : "guests"}
      </span>

      <span className="text-right">
        {req.responded ? (
          <span className="text-[13px] font-semibold text-primary">Responded</span>
        ) : (
          <button
            type="button"
            className="text-[13px] font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
          >
            Respond
          </button>
        )}
      </span>
    </div>
  );
}

export default function RentRequestsPage() {
  const { user, ready } = useAuth();

  // Guard: only signed-in users can view their rent requests.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">
          Please sign in to view your rent requests.
        </p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-10 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[190px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar active="Rent Requests" />
        </aside>

        {/* Right — rent requests card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-ink">
              <span className="text-primary">{rentRequests.length}</span>{" "}
              Active Rent Requests
            </h2>
            <SortDropdown />
          </div>

          {/* Column headings */}
          <div className="mt-6 grid grid-cols-[1.4fr_1.2fr_1.1fr_1fr_0.8fr] px-4 text-[13px] text-muted">
            {COLUMNS.map((c) => (
              <span key={c} className={c === "Status" ? "text-right" : ""}>
                {c}
              </span>
            ))}
          </div>

          {/* Rows */}
          <div className="mt-2.5 space-y-3">
            {rentRequests.map((req, i) => (
              <RequestRow key={i} req={req} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
