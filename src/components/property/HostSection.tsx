import { Mail, Phone, ShieldCheck, Shield } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

/**
 * "Hosted by …" on the villa detail page — the real owner of this listing:
 * their photo (or a gender-based placeholder when they have none), name, and
 * tappable e-mail / phone so a guest can reach them.
 */
export default function HostSection({
  name,
  avatar,
  gender,
  email,
  phone,
}: {
  name: string;
  avatar?: string;
  gender?: string;
  email?: string;
  phone?: string;
}) {
  const displayName = name || "your host";
  return (
    <section className="border-b border-line py-6">
      <div className="flex items-center gap-4">
        <Avatar src={avatar} name={name} gender={gender} size={64} />
        <div className="min-w-0">
          <h3 className="text-[18px] font-bold text-ink">Hosted by {displayName}</h3>
          <span className="mt-1 inline-flex items-center gap-2 text-[14px] text-ink">
            <ShieldCheck size={16} className="text-primary" aria-hidden />
            Identity Verified
          </span>
        </div>
      </div>

      {/* Real contact details for this host. */}
      <div className="mt-5 space-y-2 text-[15px]">
        {email && (
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-2.5 text-ink transition-colors hover:text-primary"
          >
            <Mail size={17} className="shrink-0 text-primary" aria-hidden />
            <span className="truncate">{email}</span>
          </a>
        )}
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex items-center gap-2.5 text-ink transition-colors hover:text-primary"
          >
            <Phone size={17} className="shrink-0 text-primary" aria-hidden />
            <span>{phone}</span>
          </a>
        )}
        {!email && !phone && (
          <p className="text-[14px] text-muted">
            Contact details become available with your booking.
          </p>
        )}
      </div>

      {/* No "Contact Host" button: the e-mail and phone above are already the
          ways to reach them, and the button only repeated the mailto link. */}

      <div className="mt-6 flex items-start gap-3 text-[14px] text-body">
        <Shield size={22} className="mt-0.5 shrink-0 fill-ink text-ink" aria-hidden />
        <p>
          To protect your payment, never transfer money or communicate outside of the MyVilla
          website or app.
        </p>
      </div>
    </section>
  );
}
