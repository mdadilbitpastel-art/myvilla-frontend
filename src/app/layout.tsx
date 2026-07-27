import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import OfferBar from "@/components/OfferBar";
import Footer from "@/components/Footer";
import PageScrollbar from "@/components/ui/PageScrollbar";
import CheckInReminder from "@/components/CheckInReminder";
import { AuthProvider } from "@/lib/auth";
import { FavoritesProvider } from "@/lib/favorites";
import { ToastProvider } from "@/lib/toast";
import { ConfirmProvider } from "@/lib/confirm";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MyVilla.com — Book & list villas",
  description:
    "MyVilla.com — discover, book and list beautiful villas around the world. Two-in-one: stay at a villa or host your own.",
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
                {/* Above the header and in the flow, so it scrolls away and
                    leaves the sticky nav pinned at the top on its own. */}
                <OfferBar />
                <Navbar />
                <CheckInReminder />
                <main className="flex-1">{children}</main>
                <Footer />
                <PageScrollbar />
              </FavoritesProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
