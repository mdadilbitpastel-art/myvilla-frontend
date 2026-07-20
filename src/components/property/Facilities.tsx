"use client";

import { useState } from "react";
import {
  AirVent,
  Car,
  CalendarDays,
  AlarmSmoke,
  Tv,
  Wifi,
  Waves,
  Bath,
  Flame,
  ChevronDown,
} from "lucide-react";
import type { Facility } from "@/lib/villa";

const ICONS = {
  ac: AirVent,
  parking: Car,
  calendar: CalendarDays,
  smoke: AlarmSmoke,
  tv: Tv,
  wifi: Wifi,
  pool: Waves,
  jacuzzi: Bath,
  bbq: Flame,
} as const;

// Extra facilities revealed by "See all facilities"
const EXTRA: Facility[] = [
  { label: "Kitchen", icon: "tv" },
  { label: "Free parking", icon: "parking" },
  { label: "Heating", icon: "ac" },
  { label: "Washer", icon: "wifi" },
];

export default function Facilities({ facilities }: { facilities: Facility[] }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? [...facilities, ...EXTRA] : facilities;

  return (
    <section className="border-b border-line py-6">
      <h3 className="mb-5 text-[18px] font-semibold text-primary">Facilities Provided</h3>

      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {list.map((f, i) => {
          const Icon = ICONS[f.icon];
          return (
            <div key={`${f.label}-${i}`} className="flex items-center gap-4">
              <Icon size={26} aria-hidden className="shrink-0 text-primary" strokeWidth={1.6} />
              <span className="text-[15px] text-ink">{f.label}</span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-expanded={showAll}
        onClick={() => setShowAll((v) => !v)}
        className="mt-6 flex items-center gap-2 text-[15px] font-semibold text-ink transition-colors hover:text-primary"
      >
        {showAll ? "Show less" : "See all facilities"}
        <ChevronDown
          size={18}
          className={`text-primary transition-transform ${showAll ? "rotate-180" : ""}`}
        />
      </button>
    </section>
  );
}
