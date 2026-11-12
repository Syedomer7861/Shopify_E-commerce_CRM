import { notFound } from "next/navigation";
import { SECTIONS, getSection } from "@/content";
import { SectionIndex, siteMetadata } from "@/components/site/PageView";

// Only the sections in src/content exist; anything else is a 404, so this
// root-level dynamic segment can never shadow or invent an app route.
export const dynamicParams = false;
export const generateStaticParams = () => SECTIONS.map((s) => ({ section: s.key }));

export function generateMetadata({ params }: { params: { section: string } }) {
  const s = getSection(params.section);
  return s ? siteMetadata(`/${s.key}`, s.title, s.description) : {};
}

export default function Page({ params }: { params: { section: string } }) {
  const s = getSection(params.section);
  if (!s) notFound();
  return <SectionIndex section={s} />;
}
