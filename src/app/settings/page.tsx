"use client";

import Link from "next/link";
import {
  UserCircle,
  Shield,
  Bell,
  KeyRound,
  BarChart3,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import SettingsSidebar from "@/components/settings/SettingsSidebar";

const OPTIONS: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: UserCircle,
    title: "Personal Settings",
    desc: "Settings related to Personal details and contact informations",
  },
  {
    icon: Shield,
    title: "Privacy & Sharing",
    desc: "Control the apps that are connected to your accounts, things you share, and who sees them.",
  },
  {
    icon: Bell,
    title: "Notifications Settings",
    desc: "Choose how you prefer your notifications to be & how you like to be contacted.",
  },
  {
    icon: KeyRound,
    title: "Login & Security",
    desc: "Private account settings, password and login informations settings.",
  },
  {
    icon: BarChart3,
    title: "Professional Tools",
    desc: "Manage professional Tools if you own a bigger business in MyVilla",
  },
  {
    icon: SlidersHorizontal,
    title: "Global Preferences",
    desc: "Settings related to currency, languages and others.",
  },
];

export default function SettingsPage() {
  const { user, ready } = useAuth();

  // Guard: only signed-in users can view settings.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">
          Please sign in to view your settings.
        </p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-10 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[190px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar active="Settings" />
        </aside>

        {/* Right — options card */}
        <div className="w-full max-w-[640px] rounded-2xl border border-line bg-white p-5 sm:p-6">
          <div className="space-y-4">
            {OPTIONS.map(({ icon: Icon, title, desc }) => (
              <Link
                key={title}
                href="#"
                className="flex items-start gap-4 rounded-xl border border-line px-5 py-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.02]"
              >
                <Icon size={22} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="text-[15px] font-semibold text-primary">{title}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-muted">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
