import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
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
                <Navbar />
                <main className="flex-1">{children}</main>
                <Footer />
              </FavoritesProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
