import { redirect } from "next/navigation";

export default function ProjectRoot({
  params,
}: {
  params: { orgSlug: string; projectSlug: string };
}) {
  redirect(`/studio/orgs/${params.orgSlug}/projects/${params.projectSlug}/environments`);
}
