import { T } from "@arthur/shared";
import { VerifyButton } from "./VerifyButton";

/**
 * Conferma del magic link. Il token viene consumato solo con il clic su "Accedi"
 * (POST), così i sistemi che pre-aprono i link nelle email non lo invalidano.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <main id="contenuto" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-semibold">{T.auth.verifyTitle}</h1>
      <VerifyButton token={t ?? ""} />
    </main>
  );
}
