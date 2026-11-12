import { notFound } from "next/navigation";
import { POSTS, getPost } from "@/content/blog";
import { siteMetadata } from "@/components/site/PageView";
import PostView from "@/components/site/BlogView";

export const dynamicParams = false;
export const generateStaticParams = () => POSTS.map((p) => ({ slug: p.slug }));

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props) {
  const p = getPost(params.slug);
  if (!p) return {};
  return { ...siteMetadata(`/blog/${p.slug}`, p.metaTitle || p.title, p.description, "article", `/blog/${p.slug}/og`), keywords: [p.keyword, p.category] };
}

export default function Page({ params }: Props) {
  const p = getPost(params.slug);
  if (!p) notFound();
  return <PostView post={p} />;
}
