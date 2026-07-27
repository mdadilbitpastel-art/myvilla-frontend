import PageHeader from "@/components/ui/PageHeader";

/**
 * The legal pages' heading. Nothing but the shared page header, so Terms and
 * Privacy read exactly like "Manage Account" rather than a one-off hero.
 */
export default function LegalHeader({ title }: { title: string }) {
  return <PageHeader crumbs={[{ label: "Home", href: "/" }, { label: title }]} title={title} />;
}
