/**
 * Schema PostgreSQL.
 * NESSUNA tabella contiene dati dei partecipanti: niente nickname, token, risposte, IP.
 * I dati delle sessioni vivono solo in Redis (vedi packages/shared/src/server/keys.ts).
 */
import { sql } from "drizzle-orm";
import { customType, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ActivityContent, ActivitySettings, Slide } from "@arthur/shared";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const roleEnum = pgEnum("user_role", ["admin", "facilitator"]);
export const tokenPurposeEnum = pgEnum("login_token_purpose", ["login", "invite"]);
export const libraryEnum = pgEnum("activity_library", ["personal", "shared"]);
export const audienceEnum = pgEnum("activity_audience", ["studenti", "docenti", "entrambi"]);
export const langEnum = pgEnum("moderation_lang", ["it", "en"]);
export const matchEnum = pgEnum("moderation_match", ["word", "contains"]);

/** Facilitatori e admin: unici dati personali salvati sono nome ed email di login. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull().default("facilitator"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

/** Magic link e inviti: si salva solo l'hash SHA-256 del token. */
export const loginTokens = pgTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purpose: tokenPurposeEnum("purpose").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** Sessioni di login dei facilitatori: hash del cookie, nessun IP né user-agent. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    idHash: text("id_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

/** Attività: solo contenuto, mai risultati. */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    slides: jsonb("slides").$type<Slide[]>().notNull(),
    settings: jsonb("settings").$type<ActivitySettings>().notNull(),
    library: libraryEnum("library").notNull().default("personal"),
    audience: audienceEnum("audience").notNull().default("studenti"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_owner_idx").on(t.ownerId), index("activities_library_idx").on(t.library)],
);

/** Immagini delle slide di contenuto (WebP, max 1600 px, metadati rimossi). */
export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Liste del filtro di moderazione, modificabili dall'admin. */
export const moderationTerms = pgTable(
  "moderation_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lang: langEnum("lang").notNull(),
    term: text("term").notNull(),
    match: matchEnum("match").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("moderation_terms_lang_term_idx").on(t.lang, t.term)],
);

export type User = typeof users.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type ActivityRow = Activity;
export type { ActivityContent };
