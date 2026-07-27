import type { Metadata } from "next";
import {
  FileText,
  Settings2,
  Share2,
  UserCheck,
  Globe2,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import LegalHeader from "@/components/legal/LegalHeader";
import { privacyIntro, privacyRegions, privacySupplemental } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — MyVilla.com",
  description: "MyVilla.com Privacy Policy.",
};

// The four things the policy is about — pulled straight from the intro line so
// the page opens by telling you exactly what it covers.
const PILLARS = [
  { icon: FileText, title: "What we collect", desc: "The personal information you share and what we gather as you use MyVilla." },
  { icon: Settings2, title: "How we use it", desc: "How your information powers bookings, safety, support, and a better trip." },
  { icon: Share2, title: "How it's shared", desc: "When and with whom your information is shared — and never sold." },
  { icon: UserCheck, title: "Your rights", desc: "The choices and controls you have over your personal information." },
];

export default function PrivacyPage() {
  return (
    <div className="pb-20">
      <LegalHeader title="Privacy Policy" />

      <div className="mx-auto max-w-[1320px] px-5 pt-4 lg:px-7">
        {/* Lead */}
        <p className="max-w-[680px] text-[14px] leading-7 text-body">{privacyIntro}</p>
        <span className="mt-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary">
          Last updated · Feb 10, 2022
        </span>

        {/* Pillars */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-line bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon size={19} aria-hidden />
              </span>
              <h3 className="mt-3.5 text-[14px] font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-6 text-body">{desc}</p>
            </div>
          ))}
        </div>

        {/* Regional policies */}
        <div className="mt-12">
          <div className="flex items-center gap-2">
            <Globe2 size={18} className="text-primary" aria-hidden />
            <h2 className="text-[20px] font-extrabold text-ink">Policies by region</h2>
          </div>
          <p className="mt-1.5 max-w-[640px] text-[13px] leading-6 text-body">
            Your rights and our obligations vary by where you live. Choose the policy
            that applies to your region.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {privacyRegions.map((r) => (
              <div
                key={r.region}
                className="flex flex-col rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
              >
                <h3 className="text-[14px] font-bold text-ink">{r.region}</h3>
                <ul className="mt-3 space-y-1.5">
                  {r.links.map((l) => (
                    <li key={l}>
                      <span
                        aria-disabled="true"
                        className="group flex cursor-default items-center justify-between gap-2 rounded-lg px-3 py-2 text-[12.5px] text-body transition-colors hover:bg-page"
                      >
                        <span>{l}</span>
                        <ChevronRight
                          size={15}
                          className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Supplemental documents */}
        <div className="mt-12 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-primary" aria-hidden />
            <h2 className="text-[18px] font-extrabold text-ink">
              Supplemental privacy documents
            </h2>
          </div>
          <p className="mt-1.5 max-w-[660px] text-[13px] leading-6 text-body">
            Some MyVilla services carry their own privacy notices. Review the ones
            that apply to you.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {privacySupplemental.map((l) => (
              <span
                key={l}
                aria-disabled="true"
                className="group flex cursor-default items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[13px] font-medium text-ink transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <span className="flex items-center gap-2.5">
                  <FileText size={16} className="shrink-0 text-primary" aria-hidden />
                  {l}
                </span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-8 text-[12px] leading-6 text-muted">
          Questions about your privacy? Reach our team any time from the Help section
          of your account — we&apos;re happy to walk you through how your data is handled.
        </p>
      </div>
    </div>
  );
}
