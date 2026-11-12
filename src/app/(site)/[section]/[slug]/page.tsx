import { notFound } from "next/navigation";
import { allPages, getPage, getSection } from "@/content";
import PageView, { siteMetadata } from "@/components/site/PageView";

export const dynamicParams = false;
export const generateStaticParams = () => allPages().map(({ section, page }) => ({ section: section.key, slug: page.slug }));

type Props = { params: { section: string; slug: string } };

export function generateMetadata({ params }: Props) {
  const s = getSection(params.section);
  const p = getPage(params.section, params.slug);
  return s && p ? siteMetadata(`/${s.key}/${p.slug}`, p.metaTitle || p.title, p.description, s.kind === "article" ? "article" : "website") : {};
}

export default function Page({ params }: Props) {
  const s = getSection(params.section);
  const p = getPage(params.section, params.slug);
  if (!s || !p) notFound();
  return <PageView section={s} page={p} />;
}
