import { pgTable, integer, text, real, timestamp } from "drizzle-orm/pg-core";

export const satellites = pgTable("satellites", {
  noradId: integer("norad_id").primaryKey(),
  name: text("name").notNull(),
  tleLine1: text("tle_line1").notNull(),
  tleLine2: text("tle_line2").notNull(),
  operator: text("operator").notNull().default("Unknown"),
  inclination: real("inclination").notNull(),
  apoapsisKm: real("apoapsis_km").notNull(),
  periapsisKm: real("periapsis_km").notNull(),
  epoch: timestamp("epoch", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
