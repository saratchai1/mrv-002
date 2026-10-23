import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const rounds = sqliteTable("survey_rounds", {
  id: text("id").primaryKey(), name: text("name").notNull(), date: text("date").notNull(),
  plotIds: text("plot_ids").notNull(), notes: text("notes").notNull(),
  status: text("status").notNull().default("open"), version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  lockedAt: text("locked_at"), createdBy: text("created_by").notNull(),
});
export const observations = sqliteTable("observations", {
  id: text("id").primaryKey(), roundId: text("round_id").notNull().references(() => rounds.id),
  recordId: text("record_id").notNull(), payload: text("payload").notNull(),
  version: integer("version").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("observation_round_record").on(t.roundId,t.recordId)]);
export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(), roundId: text("round_id").notNull(), recordId: text("record_id"),
  action: text("action").notNull(), actor: text("actor").notNull(),
  payload: text("payload").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("audit_round").on(t.roundId)]);
export const receipts = sqliteTable("operation_receipts", {
  operationId: text("operation_id").primaryKey(), requestHash: text("request_hash").notNull(),
  response: text("response").notNull(), createdAt: text("created_at").notNull(),
});
export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(), roundId: text("round_id").notNull().references(() => rounds.id),
  recordId: text("record_id").notNull(), objectKey: text("object_key").notNull(),
  fileName: text("file_name").notNull(), mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("evidence_round").on(t.roundId)]);
export const reports = sqliteTable("report_snapshots", {
  roundId: text("round_id").primaryKey().references(() => rounds.id),
  snapshot: text("snapshot").notNull(), sourceHash: text("source_hash").notNull(),
  createdAt: text("created_at").notNull(),
});
