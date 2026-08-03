import { redirect } from "next/navigation";

/**
 * Compatibility redirect. Webhooks moved under the dedicated Settings surface;
 * this keeps old links to `/studio/orgs/[slug]/webhooks` working.
 */
export default function LegacyWebhooksRedirect({ params }: { params: { orgSlug: string } }) {
  redirect(`/studio/orgs/${params.orgSlug}/settings/webhooks`);
}
