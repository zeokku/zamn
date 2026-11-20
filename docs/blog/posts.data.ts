import { type ContentData, createContentLoader } from "vitepress";

interface Frontmatter {
  title: string;
  date: string;
  description: string;
}

export type Post = ContentData & { frontmatter: Frontmatter };

declare const data: Post[];
export { data };

export default createContentLoader("blog/*.md", {
  excerpt: true,
  transform(raw): Post[] {
    return (raw as Post[])
      .filter(({ url }) => !url.endsWith("/blog/")) // the index itself
      .sort((a, b) => +new Date(b.frontmatter.date) - +new Date(a.frontmatter.date));
  },
});
