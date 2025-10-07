import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'file' | 'url'
  fileType: text("file_type"), // 'pdf' | 'txt' | 'docx'
  url: text("url"),
  content: text("content"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const chatQueries = pgTable("chat_queries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  response: text("response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const widgetConfigs = pgTable("widget_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  primaryColor: text("primary_color").notNull().default('#3B82F6'),
  backgroundColor: text("background_color").notNull().default('#FFFFFF'),
  position: text("position").notNull().default('bottom-right'),
  welcomeMessage: text("welcome_message").notNull().default('Hello! How can I help you today?'),
  placeholder: text("placeholder").notNull().default('Type your message...'),
  showBranding: text("show_branding").notNull().default('true'),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
});

export const insertChatQuerySchema = createInsertSchema(chatQueries).omit({
  id: true,
  createdAt: true,
});

export const insertWidgetConfigSchema = createInsertSchema(widgetConfigs).omit({
  id: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertChatQuery = z.infer<typeof insertChatQuerySchema>;
export type ChatQuery = typeof chatQueries.$inferSelect;
export type InsertWidgetConfig = z.infer<typeof insertWidgetConfigSchema>;
export type WidgetConfig = typeof widgetConfigs.$inferSelect;
