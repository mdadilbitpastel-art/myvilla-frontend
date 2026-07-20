import Image from "next/image";
import { Star, ShieldCheck, Shield } from "lucide-react";
import type { Villa } from "@/lib/villa";

export default function HostSection({ host }: { host: Villa["host"] }) {
  return (
    <section className="border-b border-line py-6">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-full">
          <Image src={host.avatar} alt={host.name} fill sizes="64px" className="object-cover" />
        </div>
        <div>
          <h3 className="text-[18px] font-bold text-ink">Hosted by {host.name}</h3>
          <p className="text-[14px] text-muted">{host.joined}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 text-[15px]">
        <span className="flex items-center gap-2 text-ink">
          <Star size={17} className="fill-primary text-primary" />
          {host.reviews} Reviews
        </span>
        <span className="flex items-center gap-2 text-ink">
          <ShieldCheck size={18} className="text-primary" />
          Identity Verified
        </span>
      </div>

      <div className="mt-4 space-y-1 text-[15px] text-ink">
        <p>Response rate: {host.responseRate}</p>
        <p>Response time: {host.responseTime}</p>
      </div>

      <button type="button" className="mt-5 rounded-lg border border-primary/40 px-5 py-2.5 text-[14px] font-medium text-primary transition-colors hover:bg-primary/5">
        Contact Host
      </button>

      <div className="mt-6 flex items-start gap-3 text-[14px] text-body">
        <Shield size={22} className="mt-0.5 shrink-0 fill-ink text-ink" />
        <p>
          To protect your payment, never transfer money or communicate outside of the MyVilla
          website or app.
        </p>
      </div>
    </section>
  );
}
