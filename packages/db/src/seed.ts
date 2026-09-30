/** Carica le liste iniziali del filtro di moderazione (idempotente). */
import { SEED_TERMS } from "@arthur/shared/server";
import { createDb, moderationTerms } from "./index";

const { db, client } = createDb(undefined, 1);
await db.insert(moderationTerms).values(SEED_TERMS).onConflictDoNothing();
await client.end();
console.log(`Liste di moderazione caricate (${SEED_TERMS.length} termini).`);
process.exit(0);
