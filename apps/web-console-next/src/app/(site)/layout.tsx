import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { PRODUCT_NAME } from "@/lib/app-config";

export const metadata: Metadata = {
  title: {
    default: `${PRODUCT_NAME} — movies, TV and the people who make them`,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description:
    "Ratings, reviews, credits, awards and watchlists for every title in the catalog.",
};

/**
 * The public catalog's layout.
 *
 * The operator console keeps its own routes and its own chrome; this group
 * wraps only the site. Two products, one deployment, no shared shell to
 * compromise for both.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
