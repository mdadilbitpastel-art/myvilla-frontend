import {
  PlaneTakeoff,
  Sparkles,
  ChefHat,
  Map,
  Car,
  Shirt,
  Flower2,
  Baby,
  ConciergeBell,
} from "lucide-react";
import type { ExtraService } from "@/lib/api";

// Keyed by the exact labels the "Add your Villa" wizard offers (see
// lib/services.ts). Anything else falls back to the concierge bell.
const ICONS: Record<string, typeof ConciergeBell> = {
  "airport pickup": PlaneTakeoff,
  "daily housekeeping": Sparkles,
  "private chef": ChefHat,
  "guided tours": Map,
  "car rental": Car,
  "laundry service": Shirt,
  "spa & wellness": Flower2,
  babysitting: Baby,
};

export default function ExtraServices({ services }: { services: ExtraService[] }) {
  // The block is optional for the host, so it's optional on the page too —
  // an empty "Extra Services" heading would read as a missing feature.
  if (!services.length) return null;

  return (
    <section className="border-b border-line py-6">
      <h3 className="text-[18px] font-semibold text-primary">Extra Services</h3>
      <p className="mb-5 mt-1 text-[13px] text-muted">
        Premium services you can add to your stay at checkout, priced per night.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {services.map((svc, i) => {
          const Icon = ICONS[svc.name.trim().toLowerCase()] ?? ConciergeBell;
          return (
            <div
              key={`${svc.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-line px-4 py-3"
            >
              <Icon size={22} aria-hidden className="shrink-0 text-primary" strokeWidth={1.6} />
              <span className="flex-1 text-[15px] text-ink">{svc.name}</span>
              <span className="shrink-0 text-[14px] font-semibold text-ink">
                ${svc.price}
                <span className="font-normal text-muted"> / night</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
