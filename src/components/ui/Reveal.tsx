"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Subscribe to reduced-motion changes so toggling the OS setting takes effect. */
function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * True when the entry animation should be skipped entirely — either the user
 * asked for reduced motion, or there's no IntersectionObserver to drive it
 * (in which case animating would leave the content permanently invisible).
 */
function shouldSkipAnimation() {
  return (
    typeof IntersectionObserver === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Fades + slides its children into view the first time they enter the viewport.
 * `delay` (ms) staggers grids of cards.
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: React.ElementType;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);
  // Set once the entry transition has finished, so we can drop `will-change`
  // instead of leaving every revealed card pinned to its own GPU layer.
  const [settled, setSettled] = useState(false);

  // Read as external state rather than in an effect: setting state from an
  // effect body triggers a second render pass on every card on the page.
  // The server snapshot is `false` so SSR emits the pre-animation markup.
  const skip = useSyncExternalStore(
    subscribeMotion,
    shouldSkipAnimation,
    () => false
  );

  const visible = skip || seen;
  const done = skip || settled;

  useEffect(() => {
    const el = ref.current;
    if (!el || skip) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [skip]);

  // Wait out the 700ms transition (plus this card's stagger) before settling.
  useEffect(() => {
    if (!visible || done) return;
    const id = setTimeout(() => setSettled(true), delay + 800);
    return () => clearTimeout(id);
  }, [visible, done, delay]);

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${
        done ? "is-settled" : ""
      } ${className}`}
      style={done ? undefined : { transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
