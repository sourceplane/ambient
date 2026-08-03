"use client";

import { useQuery } from "@tanstack/react-query";
import { communityApi } from "@/lib/catalog-api";
import { formatDate } from "@/lib/site-format";
import { SectionHeader } from "@/components/site/section-header";
import { SiteImage } from "@/components/site/site-image";
import { SectionState } from "@/components/site/surface-states";

export default function NewsPage() {
  const news = useQuery({
    queryKey: ["site", "news", 50],
    queryFn: () => communityApi.news({ limit: 50 }),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const articles = news.data?.news ?? [];

  return (
    <div className="pt-6">
      <SectionHeader title="Latest news" as="h1" count={articles.length} />
      <SectionState
        loading={news.isLoading}
        error={news.isError}
        empty={articles.length === 0}
        emptyText="No news has been published yet."
        onRetry={() => void news.refetch()}
      >
        <ul className="divide-y site-hairline">
          {articles.map((article) => (
            <li key={article.id} className="flex gap-4 py-4">
              {article.imageUrl ? (
                <SiteImage
                  src={article.imageUrl}
                  alt=""
                  ratio="16/9"
                  className="w-32 shrink-0 rounded sm:w-44"
                  sizes="180px"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="site-meta site-num text-xs">
                  {article.source}
                  {article.author ? ` · ${article.author}` : ""} · {formatDate(article.publishedAt)}
                </p>
                {article.url ? (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="site-focus mt-0.5 block text-base font-semibold hover:underline"
                  >
                    {article.headline}
                  </a>
                ) : (
                  <p className="mt-0.5 text-base font-semibold">{article.headline}</p>
                )}
                {article.body ? (
                  <p className="site-meta mt-1 line-clamp-3 text-sm leading-relaxed">{article.body}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </SectionState>
    </div>
  );
}
