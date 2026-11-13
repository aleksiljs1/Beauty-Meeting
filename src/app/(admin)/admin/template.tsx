/**
 * Remounts when the section changes, so the new page fades in (opacity only: the live class frame
 * is positioned from its slot's measured place, which a moving ancestor would throw off).
 */
export default function SectionTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-enter">{children}</div>;
}
