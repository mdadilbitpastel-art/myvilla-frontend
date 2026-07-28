import PageHeader from "@/components/ui/PageHeader";

/**
 * The legal pages' heading. Nothing but the shared page header, so Terms and
 * Privacy read exactly like "Manage Account" rather than a one-off hero.
 */
export default function LegalHeader({ title }: { title: string }) {
  // No breadcrumb: the title already names the page, and a trail would only
  // have repeated it.
  return <PageHeader title={title} />;
}
