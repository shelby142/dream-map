import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const dreamers = sqliteTable("dreamers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isExample: integer("is_example", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const dreams = sqliteTable("dreams", {
  id: text("id").primaryKey(),
  dreamerId: text("dreamer_id").notNull().references(() => dreamers.id),
  topic: text("topic").notNull(),
  description: text("description").notNull().default(""),
  hashtag: text("hashtag").notNull().default(""),
  status: text("status", { enum: ["dreamed", "in-progress", "achieved"] }).notNull().default("dreamed"),
  locationName: text("location_name").notNull(),
  locationLat: real("location_lat").notNull(),
  locationLon: real("location_lon").notNull(),
  destinationName: text("destination_name"),
  destinationLat: real("destination_lat"),
  destinationLon: real("destination_lon"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_dreams_dreamer").on(table.dreamerId), index("idx_dreams_location").on(table.locationLat, table.locationLon)]);

export const votes = sqliteTable("votes", {
  id: text("id").primaryKey(),
  dreamId: text("dream_id").notNull().references(() => dreams.id),
  voterId: text("voter_id").notNull().references(() => dreamers.id),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_votes_dream_voter").on(table.dreamId, table.voterId)]);

export const helpOffers = sqliteTable("help_offers", {
  id: text("id").primaryKey(),
  dreamId: text("dream_id").notNull().references(() => dreams.id),
  helperId: text("helper_id").notNull().references(() => dreamers.id),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_help_dream").on(table.dreamId)]);
