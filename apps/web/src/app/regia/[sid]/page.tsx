import { AsyncDashboard } from "@/components/live/AsyncDashboard";
import { ControlView } from "@/components/live/ControlView";
import { ai } from "@/lib/server/ai";
import { requireOwnedSession } from "@/lib/server/live";

export const dynamic = "force-dynamic";

export default async function ControlPage({ params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params;
  const { joinBase, meta } = await requireOwnedSession(sid);
  if (meta.mode === "async") return <AsyncDashboard sid={sid} joinBase={joinBase} />;
  return <ControlView sid={sid} joinBase={joinBase} aiEnabled={ai().enabled} />;
}
