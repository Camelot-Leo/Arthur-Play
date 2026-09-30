import { redirect } from "next/navigation";
import { T } from "@arthur/shared";
import { Footer } from "@/components/Footer";
import { getCurrentUser } from "@/lib/server/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/attivita");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <main id="contenuto" className="flex flex-1 flex-col justify-center gap-6 px-4 py-8">
        <p className="font-display text-xl font-semibold">{T.app.name}</p>
        <h1 className="text-3xl font-semibold">{T.auth.loginTitle}</h1>
        <LoginForm />
      </main>
      <Footer />
    </div>
  );
}
