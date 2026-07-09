"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import type { VillaCardData } from "@/lib/home";

export default function VillaCard({
  data,
  variant = "overlay",
}: {
  data: VillaCardData;
  variant?: "overlay" | "card";
}) {
  const [liked, setLiked] = useState(!!data.liked);

  const isCard = variant === "card";

  const meta = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[14px] font-semibold ${isCard ? "text-ink" : ""}`}>
          {data.city}, <span className="text-primary">{data.country}</span>
        </p>
        <p className={`shrink-0 text-[13px] font-medium ${isCard ? "text-muted" : ""}`}>
          ${data.price}/night
        </p>
      </div>
      <div
        className={`mt-0.5 flex items-center justify-between text-[12px] ${
          isCard ? "text-muted" : "opacity-80"
        }`}
      >
        <span>{data.distance}</span>
        <span>{data.dates}</span>
      </div>
    </>
  );

  return (
    <Link
      href="/villa"
      className="group relative block overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      {/* Like button */}
      <button
        type="button"
        aria-label={liked ? "Remove from saved" : "Save"}
        onClick={(e) => {
          e.preventDefault();
          setLiked((v) => !v);
        }}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow transition-transform hover:scale-110 active:scale-95"
      >
        <Heart
          size={16}
          className={liked ? "fill-red-500 text-red-500" : "text-muted"}
        />
      </button>

      {variant === "overlay" ? (
        <div className="relative aspect-[4/5]">
          <Image
            src={data.image}
            alt={`${data.city}, ${data.country}`}
            fill
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 22vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">{meta}</div>
        </div>
      ) : (
        <>
          <div className="relative aspect-[4/3]">
            <Image
              src={data.image}
              alt={`${data.city}, ${data.country}`}
              fill
              sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 22vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
          <div className="p-4 text-ink">{meta}</div>
        </>
      )}
    </Link>
  );
}
