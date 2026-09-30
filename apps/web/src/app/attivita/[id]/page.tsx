import { notFound } from "next/navigation";
import { getOwned, toContent } from "@/lib/server/activities";
import { requireUser } from "@/lib/server/auth";
import { Editor } from "./Editor";

export const dynamic = "force-dynamic";

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const row = await getOwned((await params).id, user.id);
  if (!row) notFound();
  return <Editor id={row.id} initial={toContent(row)} />;
}
