/** Remounts on each public navigation, so the page content gets a very subtle fade-in (CSS only). */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-enter">{children}</div>;
}
