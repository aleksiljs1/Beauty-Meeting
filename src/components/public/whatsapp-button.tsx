import { MessageCircleIcon } from "lucide-react";
import { publicSite } from "@/i18n/public";
import { whatsappHref } from "@/lib/public-content";

const t = publicSite.whatsappFloat;

/**
 * Round WhatsApp button in the corner of every public page, the way most visitors here contact a
 * salon. Not shown when no WhatsApp number is set (Përmbajtja → Të dhënat).
 */
export function WhatsAppButton({ number }: { number: string | null }) {
  const href = whatsappHref(number);
  if (!href) return null;
  return (
    <a
      href={`${href}?text=${encodeURIComponent(t.message)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.label}
      title={t.label}
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-30 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg ring-1 ring-black/10 transition-transform duration-200 outline-none hover:scale-105 focus-visible:ring-4 focus-visible:ring-ring/60 print:hidden md:right-6 md:bottom-6"
    >
      <MessageCircleIcon aria-hidden className="size-7" />
    </a>
  );
}
