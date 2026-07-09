"use client";

import { useState } from "react";

export default function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="border-b border-line py-6">
      <h3 className="mb-3 text-[18px] font-semibold text-primary">Description</h3>
      <p className="text-[15px] leading-7 text-body">
        {expanded ? text : `${text.slice(0, 210)}`}
        {!expanded && text.length > 210 && "… "}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="font-medium text-primary underline underline-offset-2 hover:text-primary-dark"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      </p>
    </section>
  );
}
