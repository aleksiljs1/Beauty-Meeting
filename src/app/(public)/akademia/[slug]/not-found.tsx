import { Container, LinkButton } from "@/components/public/primitives";
import { publicSite } from "@/i18n/public";

export default function CourseNotFound() {
  return (
    <Container className="py-24 sm:py-32">
      <h1 className="text-4xl sm:text-5xl">{publicSite.academy.notFoundTitle}</h1>
      <p className="mt-5 max-w-xl text-lg text-muted-foreground">{publicSite.academy.notFoundBody}</p>
      <div className="mt-9">
        <LinkButton href="/akademia">{publicSite.academy.backToCourses}</LinkButton>
      </div>
    </Container>
  );
}
