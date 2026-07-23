"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The villa's description, clamped to three lines.
 *
 * Whether it needs a toggle at all is measured, not guessed from a character
 * count: three lines is a different number of characters on a phone than on a
 * desktop, and a short description used to get a "Read more" that revealed
 * nothing. The button appears only when there is genuinely a fourth line.
 */
export default function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    // Only meaningful while the clamp is on — expanded, the element is its own
    // full height and would always compare equal.
    function measure() {
      const node = bodyRef.current;
      if (!node || expanded) return;
      setOverflows(node.scrollHeight > node.clientHeight + 1);
    }

    measure();
    // The line count follows the column width, so it has to be re-checked as
    // the layout changes — not just once on mount.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <section className="border-b border-line py-6">
      <h3 className="mb-3 text-[18px] font-semibold text-primary">Description</h3>
      <p
        ref={bodyRef}
        className={`whitespace-pre-line text-[15px] leading-7 text-body ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1.5 text-[15px] font-medium text-primary underline underline-offset-2 hover:text-primary-dark"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </section>
  );
}
