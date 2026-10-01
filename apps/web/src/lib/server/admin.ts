import { getCurrentUser, type CurrentUser } from "./auth";

/** Utente admin della richiesta API, oppure null (la route risponde 403). */
export async function currentAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}
