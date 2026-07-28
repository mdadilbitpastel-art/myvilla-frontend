"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/ui/PageHeader";

// The add/edit villa flow is a page in its own right, with its own header and
// breadcrumb — it borrows the settings routes, not the settings chrome.
const OWN_HEADER = ["/settings/property/add"];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { user, ready } = useAuth();

  // One heading for the whole account area: it stays put as the tabs change,
  // and never appears over a signed-out or still-loading page.
  const showHeader =
    ready && !!user && !OWN_HEADER.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!showHeader) return <>{children}</>;

  return (
    // The header and the page share this wrapper on purpose: a sticky element
    // can only travel inside its own parent, so a wrapper around the header
    // alone would pin it for exactly its own height and no further.
    <div>
      {/* No breadcrumb anywhere in the account area: the heading names it, and
          the section you're in is already the highlighted item in the sidebar
          right below — the trail only repeated both. */}
      <PageHeader title="Manage Account" />
      {children}
    </div>
  );
}
