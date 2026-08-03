import { redirect } from "next/navigation";

/**
 * Compatibility redirect. Organization administration moved under the dedicated
 * Settings surface; this keeps old links to `/studio/orgs/[slug]/config` working.
 */
export default function LegacyRedirect({ params }: { params: { orgSlug: string } }) {
  redirect(`/studio/orgs/${params.orgSlug}/settings/config`);
}
