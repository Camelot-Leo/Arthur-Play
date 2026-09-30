import Link from "next/link";
import { T } from "@arthur/shared";

export default function NotFound() {
  return (
    <main id="contenuto" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-semibold">{T.app.notFound}</h1>
      <Link href="/" className="btn self-start">
        {T.app.home}
      </Link>
    </main>
  );
}
