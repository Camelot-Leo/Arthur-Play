import Link from "next/link";
import { notFound } from "next/navigation";
import { T } from "@arthur/shared";
import { Footer } from "@/components/Footer";
import { ai } from "@/lib/server/ai";
import { requireUser } from "@/lib/server/auth";
import { GenerateForm } from "./GenerateForm";

export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  await requireUser();
  if (!ai().enabled) notFound();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="px-4 pt-6">
        <Link href="/attivita" className="underline underline-offset-2">
          {T.app.back}
        </Link>
      </header>
      <main id="contenuto" className="flex flex-1 flex-col gap-6 px-4 py-8">
        <h1 className="text-3xl font-semibold">{T.ai.generateTitle}</h1>
        <p>{T.ai.generateHint}</p>
        <p className="rounded-xl bg-soft p-3 text-sm">{T.ai.privacyNote}</p>
        <GenerateForm />
      </main>
      <Footer />
    </div>
  );
}
