import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import LegalHeader from "@/components/legal/LegalHeader";
import {
  termsIntro,
  tableOfContents,
  termsGroups,
  relatedTopics,
  alsoCheck,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service — MyVilla.com",
  description: "MyVilla.com Terms of Service.",
};

export default function TermsPage() {
  return (
    <div className="pb-20">
      <LegalHeader title="Terms of Service" />

      <div className="mx-auto max-w-[1320px] px-5 pt-4 lg:px-7">
        {/* Lead */}
        <p className="max-w-[680px] text-[14px] leading-7 text-body">
          A binding agreement between you and MyVilla that governs your use of our
          websites, apps, and services. Please read it carefully.
        </p>
        <span className="mt-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary">
          {termsIntro.updated}
        </span>

        {/* Arbitration callout */}
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
          <p className="text-[13px] leading-6 text-amber-900">{termsIntro.highlight}</p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[280px_1fr]">
          {/* Sticky table of contents — parks below the collapsed page header */}
          <aside className="lg:row-start-1">
            <div className="rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-[150px]">
              <h2 className="text-[13px] font-bold uppercase tracking-wide text-heading">
                Table of Contents
              </h2>
              <nav className="mt-4 space-y-5">
                {tableOfContents.map((toc) => (
                  <div key={toc.group}>
                    <p className="text-[12px] font-bold uppercase tracking-wide text-primary">
                      {toc.group}
                    </p>
                    <ul className="mt-2 space-y-0.5">
                      {toc.items.map((item) => (
                        <li key={item}>
                          <a
                            href={`#${slug(item)}`}
                            className="group flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] leading-5 text-body transition-colors hover:bg-page hover:text-primary"
                          >
                            <ChevronRight
                              size={13}
                              className="mt-0.5 shrink-0 text-muted transition-colors group-hover:text-primary"
                              aria-hidden
                            />
                            {item}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="min-w-0">
            {/* Intro */}
            <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
              <div className="space-y-4 text-[13.5px] leading-7 text-body">
                {termsIntro.paragraphs.map((p, i) => (
                  <p key={i} className={i === 0 ? "text-[15px] font-semibold text-ink" : ""}>
                    {p}
                  </p>
                ))}
              </div>
            </div>

            {/* Detailed sections */}
            <div className="mt-8 space-y-8">
              {termsGroups.map((group) => (
                <section
                  key={group.number}
                  id={slug(`${group.number}. ${group.title}`)}
                  className="scroll-mt-[150px] rounded-2xl border border-line bg-white p-6 sm:p-8"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[14px] font-extrabold text-primary">
                      {group.number}
                    </span>
                    <h2 className="text-[18px] font-extrabold leading-tight text-ink">
                      {group.title}
                    </h2>
                  </div>

                  <div className="mt-5 space-y-5 border-l-2 border-line pl-5 sm:ml-1.5">
                    {group.items.map((item) => (
                      <div
                        key={item.number}
                        id={slug(`${item.number} ${item.title}`)}
                        className="scroll-mt-[150px]"
                      >
                        <h3 className="text-[13.5px] font-bold text-ink">
                          <span className="text-primary">{item.number}</span> {item.title}
                        </h3>
                        <p className="mt-1.5 text-[13px] leading-7 text-body">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Related / also-check strip */}
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-white p-6">
                <h3 className="text-[14px] font-extrabold text-ink">Related topics</h3>
                <ul className="mt-3 space-y-1.5">
                  {relatedTopics.map((t) => (
                    <li key={t}>
                      <span
                        aria-disabled="true"
                        className="flex cursor-default items-center gap-2 text-[12.5px] text-body"
                      >
                        <span className="h-1 w-1 rounded-full bg-primary" aria-hidden />
                        {t}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-line bg-white p-6">
                <h3 className="text-[14px] font-extrabold text-ink">Also check</h3>
                <ul className="mt-3 space-y-1.5">
                  {alsoCheck.map((t) => (
                    <li key={t}>
                      {t === "Privacy Policy" ? (
                        <Link
                          href="/privacy"
                          className="flex items-center gap-2 text-[12.5px] font-medium text-primary underline underline-offset-2 hover:text-primary-dark"
                        >
                          <span className="h-1 w-1 rounded-full bg-primary" aria-hidden />
                          {t}
                        </Link>
                      ) : (
                        <span
                          aria-disabled="true"
                          className="flex cursor-default items-center gap-2 text-[12.5px] text-body"
                        >
                          <span className="h-1 w-1 rounded-full bg-primary" aria-hidden />
                          {t}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
