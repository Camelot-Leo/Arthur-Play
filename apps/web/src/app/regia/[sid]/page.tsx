import { ControlView } from "@/components/live/ControlView";
import { requireOwnedSession } from "@/lib/server/live";

export const dynamic = "force-dynamic";

export default async function ControlPage({ params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params;
  const { joinBase } = await requireOwnedSession(sid);
  return <ControlView sid={sid} joinBase={joinBase} />;
}
