import Link from "next/link";
import { T } from "@arthur/shared";

/** Pagina "Privacy e cookie": testo segnaposto, sarà fornito da Arthur Italia. */
export default function PrivacyPage() {
  return (
    <main id="contenuto" className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/" className="text-sm underline underline-offset-2">
        {T.app.back}
      </Link>
      <h1 className="mt-6 text-4xl font-semibold">{T.privacy.title}</h1>
      <div className="mt-6 text-lg">
        {/* TESTO SEGNAPOSTO — da sostituire con il testo fornito da Arthur Italia. */}
        <p>{T.privacy.placeholder}</p>
      </div>
    </main>
  );
}
