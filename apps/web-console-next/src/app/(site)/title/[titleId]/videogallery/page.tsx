"use client";

import { useParams } from "next/navigation";
import { SectionHeader } from "@/components/site/section-header";
import { VideoCard } from "@/components/site/media-grid";
import { SectionState } from "@/components/site/surface-states";
import { useTitleVideos } from "@/components/site/use-title-data";

export default function VideoGalleryPage() {
  const { titleId } = useParams<{ titleId: string }>();
  const videos = useTitleVideos(titleId);
  const list = videos.data?.videos ?? [];

  return (
    <div>
      <SectionHeader title="Videos" as="h1" count={list.length} />
      <SectionState
        loading={videos.isLoading}
        error={videos.isError}
        empty={list.length === 0}
        emptyText="No videos have been added for this title yet."
        onRetry={() => void videos.refetch()}
      >
        <ul
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
        >
          {list.map((video) => (
            <li key={video.id}>
              <VideoCard video={video} />
            </li>
          ))}
        </ul>
      </SectionState>
    </div>
  );
}
