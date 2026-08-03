"use client";

import { SectionHeader } from "@/components/site/section-header";
import { SurfaceMissing } from "@/components/site/surface-states";

/**
 * Awards central.
 *
 * The API exposes awards per title, per person, and per edition
 * (`/v1/awards/:body/:year`) — but there is no "list every awarding body"
 * route, so there is nothing honest to index here yet. Rather than fake a
 * directory, this says where awards *are* visible and stops.
 */
export default function AwardsPage() {
  return (
    <div className="pt-6">
      <SectionHeader title="Awards" as="h1" />
      <SurfaceMissing
        heading="Awards live on the pages they belong to"
        body="Every title and every person carries its own awards tab. A browsable index of awarding bodies needs an endpoint that lists them, which the API doesn't expose yet."
      />
    </div>
  );
}
