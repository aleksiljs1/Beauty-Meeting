import type { Metadata } from "next";
import { LegalDraft } from "@/components/public/legal-draft";
import { publicSite } from "@/i18n/public";

const t = publicSite.legal.terms;

export const metadata: Metadata = { title: t.title, description: t.description, robots: { index: false } };

export default function TermsPage() {
  return <LegalDraft title={t.title} sections={t.sections} />;
}
