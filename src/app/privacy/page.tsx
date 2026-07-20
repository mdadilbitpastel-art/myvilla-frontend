import type { Metadata } from "next";
import Breadcrumb from "@/components/property/Breadcrumb";
import Img from "@/components/ui/Img";
import {
  privacyIntro,
  privacyRegions,
  privacySupplemental,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — MyVilla.com",
  description: "MyVilla.com Privacy Policy.",
};

const HERO_IMG =
  "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1200&q=80";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-20 pt-6 lg:px-7">
      <Breadcrumb items={["Home", "All Topics", "Legal Terms", "Privacy Policy"]} />

      {/* Left-aligned narrow content column (matches the design). */}
      <div className="max-w-[560px]">
        <h1 className="text-[16px] font-bold text-heading sm:text-[17px]">
          Privacy Policy
        </h1>

        {/* Hero image */}
        <div className="img-frame mt-4 overflow-hidden rounded-xl">
          <Img
            src={HERO_IMG}
            alt="Our team discussing privacy"
            priority
            className="h-[170px] w-full object-cover sm:h-[200px]"
          />
        </div>

        <p className="mt-4 text-[12px] font-bold text-ink">Privacy Policy</p>
        <p className="mt-1.5 text-[12.5px] leading-6 text-body">{privacyIntro}</p>

        {/* Regional policies */}
        <div className="mt-7 space-y-6">
          {privacyRegions.map((r) => (
            <div key={r.region}>
              <h2 className="text-[12.5px] font-bold text-ink">{r.region}</h2>
              <ul className="mt-2 space-y-1.5">
                {r.links.map((l) => (
                  <li key={l} className="flex gap-2 text-[12px]">
                    <span className="text-muted">•</span>
                    <span
                      aria-disabled="true"
                      className="cursor-default text-body underline underline-offset-2 hover:text-primary"
                    >
                      {l}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-7 text-[12.5px] leading-6 text-body">
          Please review the supplemental privacy policies linked within the privacy
          policy documents, such as for certain MyVilla services, that may be
          applicable to you.
        </p>

        <h2 className="mt-5 text-[12.5px] font-bold text-ink">
          Supplemental Privacy Policy Documents:
        </h2>
        <ul className="mt-2 space-y-1.5">
          {privacySupplemental.map((l) => (
            <li key={l} className="flex gap-2 text-[12px]">
              <span className="text-muted">•</span>
              <span
                aria-disabled="true"
                className="cursor-default text-body underline underline-offset-2 hover:text-primary"
              >
                {l}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
