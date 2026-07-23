"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { MapPin, CircleUserRound } from "lucide-react";
import { heroSlides } from "@/lib/home";
import DateField from "@/components/ui/DateField";
// The tabs are the search page's own categories: picking one here has to mean
// the same thing there. "Resort"/"Rent" matched no listing type at all.
import { SEARCH_CATEGORIES, ALL_CATEGORY } from "@/lib/categories";
import GuestSelect from "@/components/ui/GuestSelect";


// Today as a local YYYY-MM-DD string (avoids the UTC off-by-one of toISOString).
function todayStr(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function Hero() {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  // The slide we just left. It keeps zooming while it fades out, so the
  // crossfade is the only thing that changes — no scale snap-back.
  const [leaving, setLeaving] = useState(-1);
  const [tab, setTab] = useState(ALL_CATEGORY);

  // Search widget state
  const [location, setLocation] = useState("");
  const [guests, setGuests] = useState(0);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  // Set after mount so server/client first render match (no hydration mismatch).
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayStr()), []);

  // Remember which slide is on its way out (one render behind `slide`).
  const shownRef = useRef(slide);
  useEffect(() => {
    if (shownRef.current === slide) return;
    const gone = shownRef.current;
    shownRef.current = slide;
    setLeaving(gone);
    // Drop it once the crossfade is over: the zoom class has to come off while
    // the slide is invisible, otherwise the animation won't replay next time.
    const id = setTimeout(() => setLeaving((l) => (l === gone ? -1 : l)), 1700);
    return () => clearTimeout(id);
  }, [slide]);

  // Auto-advance the background carousel. Honour reduced-motion: the CSS
  // stops the ken-burns zoom but the slide swap is motion too.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setSlide((s) => (s + 1) % heroSlides.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  function onSearch() {
    const sp = new URLSearchParams();
    if (location.trim()) sp.set("q", location.trim());
    if (guests) sp.set("guests", String(guests));
    if (checkIn) sp.set("checkIn", checkIn);
    if (checkOut) sp.set("checkOut", checkOut);
    // Every filter set here travels with the redirect, the tab included — the
    // search page seeds itself from exactly these params.
    if (tab !== ALL_CATEGORY) sp.set("category", tab);
    const qs = sp.toString();
    router.push(qs ? `/search?${qs}` : "/search");
  }

  return (
    // On phones the search bar stacks into five rows, which overflows a fixed
    // 560px section and gets clipped by `overflow-hidden`. `min-h` lets the
    // small-screen hero grow; from `sm:` up the designed height is exact.
    <section className="relative min-h-[560px] w-full overflow-hidden pb-14 sm:h-[600px] sm:min-h-0 sm:pb-0">
      {/* Rotating background images */}
      {heroSlides.map((src, i) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-[1600ms] ease-in-out ${
            i === slide ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={src}
            alt=""
            fill
            priority={i === 0}
            sizes="100vw"
            // Idle slides sit at the zoom's starting scale, so the class going
            // on or off is never visible as a jump.
            className={`scale-[1.08] object-cover ${
              i === slide || i === leaving ? "hero-zoom" : ""
            }`}
          />
        </div>
      ))}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex h-full max-w-[1200px] flex-col items-center px-5 pt-24 text-center sm:pt-28">
        <h1 className="animate-fade-up text-[34px] font-extrabold leading-tight text-white drop-shadow-sm sm:text-[46px]">
          Vacation feels like home
        </h1>
        <p
          className="animate-fade-up mt-3 max-w-md text-[15px] text-white/90 sm:text-[16px]"
          style={{ animationDelay: "120ms" }}
        >
          The most comfortable accommodation you can find in our website, spread all over the world
        </p>

        {/* Search widget */}
        <div
          className="animate-fade-up mt-9 w-full max-w-[1120px]"
          style={{ animationDelay: "240ms" }}
        >
          {/* Tabs — rounded box centered above the bar */}
          <div className="flex justify-center">
            {/* Six categories don't fit one phone-width line, so they wrap. */}
            <div className="flex max-w-full flex-wrap justify-center gap-2 rounded-t-lg bg-white px-3 pt-3">
              {SEARCH_CATEGORIES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                  className={`whitespace-nowrap rounded-md px-4 py-2.5 text-[14px] transition-colors sm:px-5 sm:text-[15px] ${
                    tab === t
                      ? "bg-[#d7d0ff] font-semibold text-primary"
                      : "font-medium text-muted hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Bar */}
          <div className="flex flex-col rounded-lg bg-white p-3 shadow-xl sm:flex-row sm:items-center">
            <Field icon={<MapPin size={18} className="text-primary" />} label="Location">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                placeholder="Villa name, city or country"
                aria-label="Search by villa name, city or country"
                className="w-full bg-transparent text-[16px] font-semibold text-[#384652] outline-none placeholder:font-normal placeholder:text-[#a1a1a2]"
              />
            </Field>
            <Divider />
            {/* Its own field rather than <Field>: the control is a button, so
                a <label> around it would forward clicks and toggle the list
                twice — and the picker needs to own the whole row for its list
                to line up with it. */}
            <div className="flex flex-1 flex-col justify-center rounded-lg px-4 py-2.5 text-left transition-colors hover:bg-page">
              <span className="mb-1 text-[15px] text-[#a1a1a2]">Guest</span>
              <GuestSelect
                value={guests}
                onChange={setGuests}
                icon={<CircleUserRound size={18} className="shrink-0 text-primary" />}
                // The hero clips its overflow (the background zoom needs it),
                // so a list dropping down is cut off at the section's edge.
                placement="up"
                triggerClass="text-[16px] font-semibold text-[#384652]"
              />
            </div>
            <Divider />
            <DateField
              variant="hero"
              label="Check In"
              value={checkIn}
              min={today || undefined}
              onChange={(val) => {
                setCheckIn(val);
                // A check-out on or before the new check-in isn't a stay.
                if (checkOut && val && checkOut <= val) setCheckOut("");
              }}
              className="flex-1"
            />
            <Divider />
            <DateField
              variant="hero"
              label="Check Out"
              value={checkOut}
              min={checkIn || today || undefined}
              onChange={setCheckOut}
              className="flex-1"
            />
            <button
              type="button"
              onClick={onSearch}
              className="mt-2 flex shrink-0 items-center justify-center rounded-lg bg-primary px-8 py-3 text-[15px] font-medium text-white transition-colors hover:bg-primary-dark sm:mt-0 sm:ml-2"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Carousel dots — pinned to the bottom-center of the hero image */}
      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        {heroSlides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === slide}
            onClick={() => setSlide(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === slide ? "w-6 bg-primary" : "w-2 bg-white/70 hover:bg-white"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

function Divider() {
  return <span className="mx-1 hidden w-px self-stretch bg-line sm:my-3 sm:block" />;
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-1 cursor-text flex-col justify-center rounded-lg px-4 py-2.5 text-left transition-colors hover:bg-page">
      <span className="mb-1 text-[15px] text-[#a1a1a2]">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0">{icon}</span>
        {children}
      </span>
    </label>
  );
}
