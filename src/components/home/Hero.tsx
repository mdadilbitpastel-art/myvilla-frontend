"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { MapPin, CircleUserRound, Calendar } from "lucide-react";
import { heroSlides } from "@/lib/home";

const TABS = ["Resort", "Hotels", "Rent"];
const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];

// Today as a local YYYY-MM-DD string (avoids the UTC off-by-one of toISOString).
function todayStr(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Open the native date calendar when the field is clicked (not just the icon).
// Only ever called from a click: showPicker() throws NotAllowedError without a
// user gesture, which is why focus doesn't trigger it.
function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try {
    el.showPicker?.();
  } catch {
    // Browser refused (no gesture / unsupported) — the native icon still works.
  }
}

export default function Hero() {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  // The slide we just left. It keeps zooming while it fades out, so the
  // crossfade is the only thing that changes — no scale snap-back.
  const [leaving, setLeaving] = useState(-1);
  const [tab, setTab] = useState("Resort");

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
    // The "Hotels" tab narrows to hotel-type listings; Resort/Rent show all.
    if (tab === "Hotels") sp.set("category", "Hotel");
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
            <div className="flex gap-2 rounded-t-lg bg-white px-3 pt-3">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-6 py-2.5 text-[15px] transition-colors ${
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
                placeholder="Where are you going?"
                className="w-full bg-transparent text-[16px] font-semibold text-[#384652] outline-none placeholder:font-normal placeholder:text-[#a1a1a2]"
              />
            </Field>
            <Divider />
            <Field icon={<CircleUserRound size={18} className="text-primary" />} label="Guest">
              <select
                value={guests}
                onChange={(e) => setGuests(parseInt(e.target.value, 10))}
                className="w-full appearance-none bg-transparent text-[16px] font-semibold text-[#384652] outline-none"
              >
                <option value={0}>Any guests</option>
                {GUEST_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}+ guests
                  </option>
                ))}
              </select>
            </Field>
            <Divider />
            <Field icon={<Calendar size={18} className="text-primary" />} label="Check In">
              <input
                type="date"
                value={checkIn}
                min={today || undefined}
                onClick={openPicker}
                onChange={(e) => {
                  const val = e.target.value;
                  setCheckIn(val);
                  // If check-out is now before check-in, clear it.
                  if (checkOut && val && checkOut < val) setCheckOut("");
                }}
                className="w-full cursor-pointer bg-transparent text-[15px] font-semibold text-[#384652] outline-none"
              />
            </Field>
            <Divider />
            <Field icon={<Calendar size={18} className="text-primary" />} label="Check Out">
              <input
                type="date"
                value={checkOut}
                min={checkIn || today || undefined}
                onClick={openPicker}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full cursor-pointer bg-transparent text-[15px] font-semibold text-[#384652] outline-none"
              />
            </Field>
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
