import { LifeBuoy } from "lucide-react";
import Link from "next/link";
import { ContactActions } from "@/components/public/contact";
import { portalText } from "@/i18n/portal";
import { getPublicSettings } from "@/server/queries/public";

const t = portalText.contact;

/**
 * "Keni pyetje?": the academy's WhatsApp, phone and email, from Përmbajtja → Të dhënat. Several
 * portal messages say "kontaktoni akademinë"; this is where the student finds how.
 */
export async function ContactAcademy({ showHelpLink = true }: { showHelpLink?: boolean }) {
  const settings = await getPublicSettings();
  if (!settings.whatsapp && !settings.phone && !settings.email) return null;
  return (
    <section aria-labelledby="contact-heading" className="grid gap-3 rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <LifeBuoy aria-hidden className="mt-1 size-5 shrink-0 text-rose-deep" />
        <div>
          <h2 id="contact-heading" className="text-2xl">
            {t.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.body}</p>
        </div>
      </div>
      <ContactActions settings={settings} whatsappText={t.whatsappText} emailSubject={t.emailSubject} />
      {showHelpLink && (
        <Link href="/portal/ndihme" className="text-sm text-rose-deep underline-offset-4 hover:underline">
          {t.helpLink}
        </Link>
      )}
    </section>
  );
}
