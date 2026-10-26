export * from "./auth-schema";
import { bigint, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const examples = pgTable("examples", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  /** The data product this project was created for (src/lib/solutions.ts). Null on older projects. */
  product: text("product"),
  /** Cost vs accuracy preset for the agents, 0 (lean) to 4 (maximum). See src/lib/agent-levels.ts. */
  agentLevel: integer("agent_level").default(2).notNull(),
  monthlyPhotos: integer("monthly_photos").default(2000).notNull(),
  /** How often the agents look, in seconds between sampled frames (src/lib/tune.ts). */
  frequency: integer("frequency").default(10).notNull(),
  /** Per-agent settings (src/lib/agent-config.ts). Empty means every default. */
  agentConfig: jsonb("agent_config").$type<Record<string, unknown>>().default({}).notNull(),
  /** Set when the owner agrees to show the project on /explore; null means private. A new slug on every share. */
  shareSlug: text("share_slug").unique(),
  sharedAt: timestamp("shared_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** A named pipe of files (a study, a site, a campaign). Products and flows can read from one timeline. */
export const timelines = pgTable("timelines", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Held by the person: new work for this source waits until resumed. */
  paused: boolean("paused").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** A labelled lane inside a files source: what these files are ("portrait of Maya"). Uploads go through a lane. */
export const sourceLanes = pgTable("source_lanes", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  timelineId: uuid("timeline_id")
    .notNull()
    .references(() => timelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** What is in this lane, in the person's words. Handed to the agents as context. */
  note: text("note").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const uploads = pgTable("uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  key: text("key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  status: text("status", { enum: ["pending", "ready"] }).default("pending").notNull(),
  timelineId: uuid("timeline_id").references(() => timelines.id, { onDelete: "set null" }),
  laneId: uuid("lane_id").references(() => sourceLanes.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectProducts = pgTable(
  "project_products",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    enabledAt: timestamp("enabled_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.productId] })],
);

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
  ingestKey: text("ingest_key").notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  paused: boolean("paused").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("sources_project_idx").on(t.projectId)]);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").default("asset").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.projectId, t.name)],
);

export const assetAliases = pgTable(
  "asset_aliases",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.alias] })],
);

export const observations = pgTable("observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
  uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "set null" }),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  eventTime: timestamp("event_time").notNull(),
  arrivalTime: timestamp("arrival_time").defaultNow().notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  confidence: doublePrecision("confidence"),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().default({}).notNull(),
}, (t) => [
  index("obs_project_time_idx").on(t.projectId, t.eventTime.desc()),
  index("obs_asset_time_idx").on(t.assetId, t.eventTime),
  index("obs_type_idx").on(t.projectId, t.type),
]);

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  observationId: uuid("observation_id").references(() => observations.id, { onDelete: "set null" }),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  severity: text("severity", { enum: ["low", "medium", "high"] }).notNull(),
  summary: text("summary").notNull(),
  status: text("status", { enum: ["pending", "approved", "dismissed"] }).default("pending").notNull(),
  report: jsonb("report").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
}, (t) => [index("alerts_project_idx").on(t.projectId, t.createdAt.desc())]);

export const evidence = pgTable(
  "evidence",
  {
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.alertId, t.observationId] })],
);

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  status: text("status", { enum: ["queued", "running", "done", "failed", "paused"] }).default("queued").notNull(),
  /** Which source this work came from (src/lib/source-key.ts), so a source can be paused and its progress shown. */
  source: text("source"),
  attempts: integer("attempts").default(0).notNull(),
  error: text("error"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  runAt: timestamp("run_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
}, (t) => [index("jobs_queue_idx").on(t.status, t.runAt), index("jobs_source_idx").on(t.projectId, t.source)]);

export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Full UIMessage[] as streamed by the AI SDK, so a chat can be reopened exactly as it was.
    messages: jsonb("messages").$type<unknown[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("chats_user_project_idx").on(t.userId, t.projectId, t.updatedAt.desc())],
);

/** A saved node graph (src/lib/flow). Humans and AI agents both edit the same JSON. */
export const flows = pgTable(
  "flows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    graph: jsonb("graph").$type<{ nodes: unknown[]; edges: unknown[] }>().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("flows_project_idx").on(t.projectId, t.updatedAt.desc())],
);

/** One execution of a flow: per-node trace plus the output the flow ended with. */
export const flowRuns = pgTable(
  "flow_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    trace: jsonb("trace").$type<unknown[]>().default([]).notNull(),
    output: jsonb("output").$type<Record<string, unknown>>().default({}).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("flow_runs_flow_idx").on(t.flowId, t.createdAt.desc())],
);

/** Personal keys for coding agents (Claude Code, Muse) and scripts. Only the SHA-256 hash is stored. */
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  hash: text("hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("api_keys_user_idx").on(t.userId)]);
