import Link from "next/link";
import { T } from "@arthur/shared";
import { Footer } from "@/components/Footer";
import { CodeForm } from "./CodeForm";

/** Ingresso partecipante: codice a 6 cifre, nessun account. */
export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="px-4 pt-6">
        <p className="font-display text-xl font-semibold">
          {T.app.name}
          <span className="text-brand" aria-hidden="true">
            .
          </span>
        </p>
      </header>
      <main id="contenuto" className="flex flex-1 flex-col justify-center gap-6 px-4 py-8">
        <h1 className="text-4xl font-semibold">{T.home.title}</h1>
        <CodeForm />
      </main>
      <div className="flex items-center justify-between">
        <Footer />
        <Link href="/login" className="px-4 py-4 text-sm text-muted underline underline-offset-2">
          {T.home.facilitatorArea}
        </Link>
      </div>
    </div>
  );
}
