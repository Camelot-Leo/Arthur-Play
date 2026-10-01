import { notFound } from "next/navigation";
import { getEditable, toContent, toMeta } from "@/lib/server/activities";
import { requireUser } from "@/lib/server/auth";
import { Editor } from "./Editor";

export const dynamic = "force-dynamic";

/** Editor: solo per chi può modificare l'attività (proprietario, o admin per la libreria condivisa). */
export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const row = await getEditable((await params).id, user);
  if (!row) notFound();
  return <Editor id={row.id} initial={toContent(row)} initialMeta={toMeta(row)} />;
}
