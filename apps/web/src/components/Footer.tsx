import Link from "next/link";
import { T } from "@arthur/shared";

/** Piè di pagina presente in tutte le viste, con il link a Privacy e cookie. */
export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`px-4 py-4 text-sm text-muted ${className}`}>
      <Link href="/privacy" className="underline underline-offset-2 hover:text-black">
        {T.app.privacyLink}
      </Link>
    </footer>
  );
}
