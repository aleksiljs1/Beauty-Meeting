import { publicSite } from "@/i18n/public";
import { Container, PageHeader } from "./primitives";

/** Draft legal page. Deliberately labelled as unreviewed; it makes no compliance claims. */
export function LegalDraft({ title, sections }: { title: string; sections: readonly { heading: string; body: string }[] }) {
  return (
    <>
      <PageHeader title={title}>
        <p className="mt-6 inline-flex rounded-sm border border-rose/50 bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">
          {publicSite.legal.draftBadge}
        </p>
      </PageHeader>
      <Container className="py-14 sm:py-20">
        <div className="max-w-2xl">
          <p role="note" className="mb-12 border-l-2 border-rose pl-5 leading-relaxed text-muted-foreground">
            {publicSite.legal.draftNote}
          </p>
          <div className="space-y-10">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-2xl">{section.heading}</h2>
                <p className="mt-3 leading-relaxed text-foreground/85">{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </Container>
    </>
  );
}
