import { redirect } from "next/navigation";

// The account area has no hub of its own — "Manage Account" is the heading the
// layout draws over every tab, so opening it lands on the first tab.
export default function SettingsPage() {
  redirect("/settings/profile");
}
