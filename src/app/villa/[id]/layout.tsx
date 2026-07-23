import type { Metadata } from "next";

// The villa page itself is a client component, so it can't describe itself to
// the outside world. This layout does it server-side: without these tags a
// villa link pasted into WhatsApp, Messenger or X arrives as a bare URL with
// no name, no blurb and no photo.

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/graphql/";

type Preview = { title: string; description: string; coverImage: string };

async function fetchPreview(id: string): Promise<Preview | null> {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query Villa($id: ID!) {
          villa(id: $id) { title description city country coverImage }
        }`,
        variables: { id },
      }),
      // The listing changes rarely; a short cache keeps crawlers cheap.
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const v = json?.data?.villa;
    if (!v) return null;
    const where = [v.city, v.country].filter(Boolean).join(", ");
    return {
      title: v.title || "Villa",
      description:
        (v.description || "").trim().slice(0, 200) ||
        (where ? `A villa in ${where} on MyVilla.com.` : "A villa on MyVilla.com."),
      coverImage: v.coverImage || "",
    };
  } catch {
    // A backend that's down must not break the page — it just shares plainly.
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const preview = await fetchPreview(id);
  if (!preview) return {};

  const { title, description, coverImage } = preview;
  // Only real URLs are worth offering as a preview image — a villa whose photos
  // are stored inline (data: URLs) has nothing a chat app could fetch.
  const images = coverImage.startsWith("http") ? [coverImage] : undefined;

  return {
    title: `${title} — MyVilla.com`,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
  };
}

export default function VillaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
