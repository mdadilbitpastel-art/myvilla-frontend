import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import OfferBar from "@/components/OfferBar";
import Footer from "@/components/Footer";
import PageScrollbar from "@/components/ui/PageScrollbar";
import CheckInReminder from "@/components/CheckInReminder";
import WelcomeOfferHost from "@/components/offers/WelcomeOfferHost";
import { WelcomeOfferProvider } from "@/lib/welcome";
import { AuthProvider } from "@/lib/auth";
import { FavoritesProvider } from "@/lib/favorites";
import { ToastProvider } from "@/lib/toast";
import { ConfirmProvider } from "@/lib/confirm";
import { promo } from "@/lib/home";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const SITE_TITLE = "MyVilla.com — Book & list villas";
const SITE_DESCRIPTION =
  "MyVilla.com — discover, book and list beautiful villas around the world. Two-in-one: stay at a villa or host your own.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // What a chat app shows when the site's link is shared (see InviteCard):
  // without these, WhatsApp renders a bare URL with no photo or blurb.
  openGraph: {
    type: "website",
    siteName: "MyVilla.com",
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [promo.main],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [promo.main],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${poppins.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-page text-ink">
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <FavoritesProvider>
                <WelcomeOfferProvider>
                  {/* Above the header and in the flow, so it scrolls away and
                      leaves the sticky nav pinned at the top on its own. */}
                  <OfferBar />
                  <Navbar />
                  <CheckInReminder />
                  <main className="flex-1">{children}</main>
                  <Footer />
                  <PageScrollbar />
                  {/* Mounted here, not per page: the placard's timers measure
                      time on the SITE, and remounting would restart them on
                      every navigation. */}
                  <WelcomeOfferHost />
                </WelcomeOfferProvider>
              </FavoritesProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
