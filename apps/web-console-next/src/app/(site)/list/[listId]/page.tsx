"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { catalogApi, isNotFound, listsApi } from "@/lib/catalog-api";
import { useSession } from "@/lib/session";
import { formatDate } from "@/lib/site-format";
import { SectionHeader } from "@/components/site/section-header";
import { PosterCard } from "@/components/site/poster-card";
import { SectionState, SurfaceMissing } from "@/components/site/surface-states";

/**
 * A list.
 *
 * The token is passed when there is one and omitted when there isn't: a public
 * list is readable by anyone, a private one only by its owner, and the API
 * answers 404 either way for a list the caller may not see. Sending no token
 * for a signed-out visitor is not a degraded mode — it is the correct request.
 */
export default function ListPage() {
  const { listId } = useParams<{ listId: string }>();
  const { token } = useSession();

  const list = useQuery({
    queryKey: ["site", "list", listId, Boolean(token)],
    queryFn: () => listsApi.getList(listId, token),
    retry: false,
  });

  const items = useQuery({
    queryKey: ["site", "list-items", listId, Boolean(token)],
    queryFn: () => listsApi.listItems(listId, token),
    enabled: list.isSuccess,
    retry: false,
  });

  const ids = (items.data?.items ?? [])
    .filter((item) => item.entityType === "title")
    .map((item) => item.entityId);

  const titles = useQuery({
    queryKey: ["site", "titles", ids],
    queryFn: () => catalogApi.batchTitles(ids),
    enabled: ids.length > 0,
    retry: false,
  });

  if (list.isError) {
    return isNotFound(list.error) ? (
      <SurfaceMissing
        heading="We don't have that list"
        body="The link may be wrong, or the list may be private."
      />
    ) : (
      <SurfaceMissing heading="We couldn't load that list" body="This is usually temporary." />
    );
  }

  const record = list.data?.list;
  const resolved = titles.data?.titles ?? [];
  const ranked = record?.isRanked ?? false;

  return (
    <div className="pt-6">
      <SectionHeader title={record?.name ?? "List"} as="h1" count={record?.itemCount} />
      {record?.description ? (
        <p className="site-meta mb-2 max-w-2xl text-sm">{record.description}</p>
      ) : null}
      {record ? (
        <p className="site-meta site-num mb-6 text-xs">
          {record.likeCount} likes · updated {formatDate(record.updatedAt)}
        </p>
      ) : null}

      <SectionState
        loading={list.isLoading || items.isLoading || (ids.length > 0 && titles.isLoading)}
        error={items.isError}
        empty={resolved.length === 0}
        emptyText="This list has nothing in it yet."
        onRetry={() => void items.refetch()}
      >
        <ul className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {resolved.map((title, index) => (
            <li key={title.id}>
              {/* Rank is shown only where the list claims to be ranked —
                  numbering an unordered list invents a meaning it doesn't have. */}
              <PosterCard title={title} {...(ranked ? { rank: index + 1 } : {})} />
            </li>
          ))}
        </ul>
      </SectionState>
    </div>
  );
}
