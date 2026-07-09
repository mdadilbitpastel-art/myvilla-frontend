"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { MapPin, CircleUserRound, Calendar, ChevronDown } from "lucide-react";
import { heroSlides } from "@/lib/home";

const TABS = ["Resort", "Hotels", "Rent"];

export default function Hero() {
  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState("Resort");

  // Auto-advance the background carousel.
  useEffect(() => {
    const id = setInterval(() => {
      setSlide((s) => (s + 1) % heroSlides.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative h-[560px] w-full overflow-hidden sm:h-[600px]">
      {/* Rotating background images */}
      {heroSlides.map((src, i) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === slide ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={src}
            alt=""
            fill
            priority={i === 0}
            sizes="100vw"
            className={`object-cover ${i === slide ? "ken-burns" : ""}`}
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
            <Field icon={<MapPin size={18} className="text-primary" />} label="Location" value="New Orland" />
            <Divider />
            <Field icon={<CircleUserRound size={18} className="text-primary" />} label="Guest" value="6 Guest" />
            <Divider />
            <Field icon={<Calendar size={18} className="text-primary" />} label="Check In" value="17 July 2021" />
            <Divider />
            <Field icon={<Calendar size={18} className="text-primary" />} label="Check Out" value="25 July 2021" />
            <button className="mt-2 flex shrink-0 items-center justify-center rounded-lg bg-primary px-8 py-3 text-[15px] font-medium text-white transition-colors hover:bg-primary-dark sm:mt-0 sm:ml-2">
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
            aria-label={`Go to slide ${i + 1}`}
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
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <button className="flex flex-1 flex-col justify-center rounded-lg px-4 py-2.5 text-left transition-colors hover:bg-page">
      <span className="mb-1 text-[15px] text-[#a1a1a2]">{label}</span>
      {/* value + chevron on the same row so the arrow aligns with the text */}
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[16px] font-semibold text-[#384652]">
          {icon}
          <span className="truncate">{value}</span>
        </span>
        <ChevronDown size={20} className="shrink-0 text-[#384652]" />
      </span>
    </button>
  );
}
