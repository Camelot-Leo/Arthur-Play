import { ProjectionView } from "@/components/live/ProjectionView";
import { requireOwnedSession } from "@/lib/server/live";

export const dynamic = "force-dynamic";

export default async function ProjectionPage({ params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params;
  const { joinBase } = await requireOwnedSession(sid);
  return <ProjectionView sid={sid} joinBase={joinBase} />;
}
