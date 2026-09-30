/**
 * Crea (o promuove) un account admin da riga di comando.
 * Uso: pnpm admin:create -- --email nome@esempio.it --name "Nome Cognome" [--role facilitator]
 * Non esiste registrazione pubblica: questo è l'unico modo per creare il primo admin.
 */
import { sql } from "drizzle-orm";
import { createDb, users } from "./index";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const role = arg("role") === "facilitator" ? "facilitator" : "admin";
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
  console.error('Uso: pnpm admin:create -- --email nome@esempio.it --name "Nome" [--role facilitator]');
  process.exit(1);
}

const { db, client } = createDb(undefined, 1);
const [existing] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
if (existing) await db.update(users).set({ role, name, disabledAt: null }).where(sql`${users.id} = ${existing.id}`);
else await db.insert(users).values({ email, name, role });
await client.end();
console.log(`Account ${role} pronto. Accedi da /login con questa email.`);
