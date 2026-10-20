import { MailIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { publicSite } from "@/i18n/public";
import { mailtoHref, telHref, whatsappHref, type OpeningHoursRow } from "@/lib/public-content";
import type { PublicSettings } from "@/server/queries/public";
import { LinkButton } from "./primitives";

export function OpeningHours({ rows, className }: { rows: OpeningHoursRow[]; className?: string }) {
  if (rows.length === 0) return <p className="text-muted-foreground">{publicSite.contact.notProvided}</p>;
  return (
    <dl className={className}>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap justify-between gap-x-6 gap-y-0.5 border-b border-border/60 py-2 last:border-b-0">
          <dt>{row.days}</dt>
          <dd className="text-muted-foreground tabular-nums">{row.hours}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Contact buttons; each appears only when the value is usable as a link. */
export function ContactActions({
  settings,
  whatsappText,
  emailSubject,
  labels = {},
}: {
  settings: Pick<PublicSettings, "whatsapp" | "phone" | "email">;
  whatsappText?: string;
  emailSubject?: string;
  labels?: { whatsapp?: string; phone?: string; email?: string };
}) {
  const wa = whatsappHref(settings.whatsapp);
  const tel = telHref(settings.phone);
  const mail = mailtoHref(settings.email);
  const waHref = wa && whatsappText ? `${wa}?text=${encodeURIComponent(whatsappText)}` : wa;
  const mailHref = mail && emailSubject ? `${mail}?subject=${encodeURIComponent(emailSubject)}` : mail;
  if (!waHref && !tel && !mailHref) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {waHref && (
        <LinkButton href={waHref}>
          <MessageCircleIcon aria-hidden />
          {labels.whatsapp ?? publicSite.contact.whatsappCta}
        </LinkButton>
      )}
      {tel && (
        <LinkButton href={tel} variant={waHref ? "outline" : "primary"}>
          <PhoneIcon aria-hidden />
          {labels.phone ?? settings.phone}
        </LinkButton>
      )}
      {mailHref && (
        <LinkButton href={mailHref} variant="outline">
          <MailIcon aria-hidden />
          {labels.email ?? settings.email}
        </LinkButton>
      )}
    </div>
  );
}
