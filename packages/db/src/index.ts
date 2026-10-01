import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { and, arrayContains, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
export { schema };

export const databaseUrl = () => process.env.DATABASE_URL ?? "postgres://arthur:arthur@127.0.0.1:5432/arthur_play";

export function createDb(url = databaseUrl(), max = 10) {
  const client = postgres(url, { max, onnotice: () => {} });
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
