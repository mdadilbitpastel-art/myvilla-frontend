import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumb from "@/components/property/Breadcrumb";
import {
  termsIntro,
  tableOfContents,
  termsGroups,
  relatedTopics,
  alsoCheck,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms and Condition — MyVilla.com",
  description: "MyVilla.com Terms of Service.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-20 pt-6 lg:px-7">
      <Breadcrumb items={["Home", "All Topics", "Legal Terms", "Terms of Service"]} />

      <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[1fr_290px]">
        {/* Main content */}
        <div className="min-w-0">
          <h1 className="text-[16px] font-bold text-heading sm:text-[17px]">
            Terms and Condition
          </h1>

          <p className="mt-3.5 text-[13px] font-bold leading-6 text-ink">
            {termsIntro.highlight}
          </p>
          <p className="mt-4 text-[12.5px] text-muted">{termsIntro.updated}</p>

          <div className="mt-4 space-y-4 text-[12.5px] leading-6 text-body">
            {termsIntro.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {/* Table of contents */}
          <h2 className="mt-8 text-[13px] font-bold text-ink">Table of Contents</h2>
          <div className="mt-3 space-y-5">
            {tableOfContents.map((toc) => (
              <div key={toc.group}>
                <h3 className="text-[13px] font-bold text-ink">{toc.group}</h3>
                <ul className="mt-2 space-y-1.5">
                  {toc.items.map((item) => (
                    <li key={item}>
                      <a
                        href={`#${slug(item)}`}
                        className="text-[12.5px] text-ink underline underline-offset-2 hover:text-primary"
                      >
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Detailed sections */}
          <div className="mt-9 space-y-7">
            {termsGroups.map((group) => (
              <section key={group.number} id={slug(`${group.number}. ${group.title}`)}>
                <h2 className="text-[13.5px] font-bold text-ink">
                  {group.number}. {group.title}
                </h2>
                <div className="mt-3 space-y-4">
                  {group.items.map((item) => (
                    <div key={item.number} id={slug(`${item.number} ${item.title}`)}>
                      <h3 className="text-[12.5px] font-bold text-ink">
                        {item.number} {item.title}
                      </h3>
                      <p className="mt-1 text-[12.5px] leading-6 text-body">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="lg:row-start-1 lg:mt-0">
          <div className="rounded-xl border border-line bg-white p-5 shadow-[0_10px_40px_rgba(0,0,0,0.07)] lg:sticky lg:top-[88px]">
            <h3 className="text-[14px] font-bold text-heading">Related Topics</h3>
            <ol className="mt-3 space-y-2">
              {relatedTopics.map((t, i) => (
                <li key={t} className="flex gap-1.5 text-[12.5px]">
                  <span className="text-muted">{i + 1}.</span>
                  <span aria-disabled="true" className="cursor-default text-body underline underline-offset-2 hover:text-primary">
                    {t}
                  </span>
                </li>
              ))}
            </ol>

            <h3 className="mt-6 text-[14px] font-bold text-heading">Also check</h3>
            <ol className="mt-3 space-y-2">
              {alsoCheck.map((t, i) => (
                <li key={t} className="flex gap-1.5 text-[12.5px]">
                  <span className="text-muted">{i + 1}.</span>
                  {t === "Privacy Policy" ? (
                    <Link href="/privacy" className="text-body underline underline-offset-2 hover:text-primary">
                      {t}
                    </Link>
                  ) : (
                    <span aria-disabled="true" className="cursor-default text-body underline underline-offset-2 hover:text-primary">
                      {t}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </aside>
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
