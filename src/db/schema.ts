/**
 * Database schema.
 *
 * Conventions
 * - Money is stored as integer minor units (paise) in `bigint` columns, read as JS numbers.
 *   Number.MAX_SAFE_INTEGER paise is ~₹90 lakh crore, comfortably above personal-finance ranges.
 * - Calendar dates the user thinks in (transaction date, due date, plan date) are `date`
 *   strings (YYYY-MM-DD) interpreted in the user's timezone. Instants are `timestamptz`.
 * - Every user-owned row carries `userId`; the data-access layer always filters by it.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  date,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Better Auth tables (field names follow Better Auth's core schema)   */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  // App fields (declared to Better Auth as additionalFields with input: false)
  isDemo: boolean("is_demo").notNull().default(false),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Preferences and financial profile                                  */
/* ------------------------------------------------------------------ */

export type NotificationPrefs = {
  inApp: boolean;
  browserPush: boolean;
  billReminders: boolean;
  weeklyReview: boolean;
  dailyBriefing: boolean;
  quietStart: string; // "22:00"
  quietEnd: string; // "07:30"
  maxPerDay: number;
};

export const preferences = pgTable("preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currency: text("currency").notNull().default("INR"),
  locale: text("locale").notNull().default("en-IN"),
  theme: text("theme", { enum: ["neon", "system", "light", "dark"] }).notNull().default("neon"),
  gamification: text("gamification", { enum: ["full", "reduced", "off"] })
    .notNull()
    .default("full"),
  aiDataUse: text("ai_data_use", { enum: ["off", "aggregates", "explanations"] })
    .notNull()
    .default("off"),
  weekStartsOn: integer("week_starts_on").notNull().default(1), // 1 = Monday
  restDaysPerWeek: integer("rest_days_per_week").notNull().default(1),
  newsTopics: jsonb("news_topics").$type<string[]>().notNull().default([]),
  followedEntities: jsonb("followed_entities").$type<string[]>().notNull().default([]),
  notifications: jsonb("notifications").$type<NotificationPrefs>(),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Onboarding answers. Every field is nullable: a null value with the field name
 * listed in `skipped` means the user chose not to answer.
 */
export const financialProfile = pgTable("financial_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  monthlyIncome: money("monthly_income"),
  incomeStability: text("income_stability", {
    enum: ["stable", "variable", "irregular", "none"],
  }),
  monthlyEssentials: money("monthly_essentials"),
  monthlyDebtPayments: money("monthly_debt_payments"),
  emergencySavings: money("emergency_savings"),
  liquidityNeeds: text("liquidity_needs"), // free text: known large expenses in next 12 months
  liquidityAmount: money("liquidity_amount"),
  liquidityWithinMonths: integer("liquidity_within_months"),
  riskTolerance: text("risk_tolerance", { enum: ["low", "medium", "high"] }),
  riskCapacity: text("risk_capacity", { enum: ["low", "medium", "high"] }),
  investmentExperience: text("investment_experience", { enum: ["none", "some", "experienced"] }),
  skipped: jsonb("skipped").$type<string[]>().notNull().default([]),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Money                                                              */
/* ------------------------------------------------------------------ */

export const ACCOUNT_TYPES = [
  "bank",
  "cash",
  "wallet",
  "credit_card",
  "investment",
  "loan",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const finAccounts = pgTable(
  "fin_account",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
    institution: text("institution"),
    /** Balance on `openingDate`. For liabilities (credit card, loan) a positive value means money owed. */
    openingBalance: money("opening_balance").notNull().default(0),
    openingDate: date("opening_date").notNull(),
    includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
    creditLimit: money("credit_limit"),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("fin_account_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "category",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    essential: boolean("essential").notNull().default(false),
    color: text("color").notNull().default("slate"),
    icon: text("icon"),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("category_user_name_kind").on(t.userId, t.name, t.kind)],
);

export const TXN_TYPES = ["income", "expense", "transfer", "refund"] as const;
export type TxnType = (typeof TXN_TYPES)[number];

/**
 * A movement of money. `amount` is always positive; `type` gives direction.
 * - income: into accountId
 * - expense: out of accountId (on a credit card this increases the amount owed)
 * - refund: into accountId, reduces spending in the split categories
 * - transfer: out of accountId into toAccountId; never income or spending.
 *   A credit-card bill payment is a transfer from bank -> card.
 */
export const transactions = pgTable(
  "txn",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: TXN_TYPES }).notNull(),
    date: date("date").notNull(),
    amount: money("amount").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => finAccounts.id, { onDelete: "restrict" }),
    toAccountId: text("to_account_id").references(() => finAccounts.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    merchant: text("merchant"),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    paymentMethod: text("payment_method"), // upi, card, cash, netbanking...
    refundOfId: text("refund_of_id"),
    recurringId: text("recurring_id"),
    importBatchId: text("import_batch_id"),
    /** Stable fingerprint used for import duplicate detection. */
    fingerprint: text("fingerprint"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("txn_user_date_idx").on(t.userId, t.date),
    index("txn_user_fp_idx").on(t.userId, t.fingerprint),
  ],
);

/** Category allocation. income/expense/refund have >= 1 split summing to the amount; transfers have none. */
export const transactionSplits = pgTable(
  "txn_split",
  {
    id: id(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
  },
  (t) => [index("txn_split_txn_idx").on(t.transactionId), index("txn_split_user_idx").on(t.userId)],
);

export const budgets = pgTable(
  "budget",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    amount: money("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budget_user_cat_month").on(t.userId, t.categoryId, t.month)],
);

/**
 * Known recurring commitments and income: bills, subscriptions, rent, salary, SIPs.
 * These drive forecasts; they are not transactions until marked paid.
 */
export const recurringItems = pgTable(
  "recurring_item",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    direction: text("direction", { enum: ["outflow", "inflow"] }).notNull(),
    kind: text("kind", { enum: ["bill", "subscription", "income", "emi", "investment", "other"] })
      .notNull()
      .default("bill"),
    amount: money("amount").notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    accountId: text("account_id").references(() => finAccounts.id, { onDelete: "set null" }),
    frequency: text("frequency", { enum: ["weekly", "monthly", "quarterly", "yearly"] }).notNull(),
    nextDueDate: date("next_due_date").notNull(),
    remindDaysBefore: integer("remind_days_before").notNull().default(2),
    essential: boolean("essential").notNull().default(true),
    active: boolean("active").notNull().default(true),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("recurring_user_idx").on(t.userId)],
);

export const goals = pgTable("goal", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["emergency", "purchase", "education", "travel", "retirement", "other"] })
    .notNull()
    .default("other"),
  targetAmount: money("target_amount").notNull(),
  targetDate: date("target_date"),
  priority: integer("priority").notNull().default(2),
  plannedMonthly: money("planned_monthly"),
  archived: boolean("archived").notNull().default(false),
  createdAt: createdAt(),
});

/** Actual contributions only; planned amounts live on the goal (`plannedMonthly`). */
export const goalContributions = pgTable(
  "goal_contribution",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    amount: money("amount").notNull(), // negative = withdrawal
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("goal_contrib_goal_idx").on(t.goalId)],
);

export const ASSET_CLASSES = ["equity", "debt", "gold", "cash", "real_estate", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Manually maintained holdings. Values are as of `valuationDate`, never live prices. */
export const holdings = pgTable("holding", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  assetClass: text("asset_class", { enum: ASSET_CLASSES }).notNull(),
  value: money("value").notNull(),
  valuationDate: date("valuation_date").notNull(),
  costBasis: money("cost_basis"),
  monthlyContribution: money("monthly_contribution"),
  includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const importBatches = pgTable("import_batch", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  accountId: text("account_id").references(() => finAccounts.id, { onDelete: "set null" }),
  rowCount: integer("row_count").notNull(),
  importedCount: integer("imported_count").notNull(),
  skippedDuplicates: integer("skipped_duplicates").notNull(),
  createdAt: createdAt(),
});

export const dismissedInsights = pgTable(
  "dismissed_insight",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    insightKey: text("insight_key").notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.insightKey] })],
);

/* ------------------------------------------------------------------ */
/* Schedule                                                           */
/* ------------------------------------------------------------------ */

export const TASK_KINDS = [
  "task",
  "money_review",
  "bill",
  "budget_setup",
  "briefing",
  "plan_review",
  "focus",
] as const;

export const tasks = pgTable(
  "task",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    kind: text("kind", { enum: TASK_KINDS }).notNull().default("task"),
    /** Plan date in the user's timezone. Null = inbox / unscheduled. */
    planDate: date("plan_date"),
    /** Local start time "HH:MM" on planDate. Null = flexible within the day. */
    startTime: text("start_time"),
    durationMin: integer("duration_min").notNull().default(30),
    deadline: date("deadline"),
    isTopPriority: boolean("is_top_priority").notNull().default(false),
    status: text("status", { enum: ["todo", "done", "skipped"] }).notNull().default("todo"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    routineId: text("routine_id"),
    carriedFromDate: date("carried_from_date"),
    carryCount: integer("carry_count").notNull().default(0),
    /** Link to a financial entity, e.g. "recurring:<id>" or "goal:<id>". */
    linkRef: text("link_ref"),
    publishToCalendar: boolean("publish_to_calendar").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("task_user_date_idx").on(t.userId, t.planDate),
    uniqueIndex("task_routine_date").on(t.userId, t.routineId, t.planDate),
    uniqueIndex("task_link_date").on(t.userId, t.linkRef, t.planDate),
  ],
);

/** Recurring time blocks that instantiate tasks idempotently (unique routineId + planDate). */
export const routines = pgTable("routine", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind", { enum: TASK_KINDS }).notNull().default("task"),
  daysOfWeek: jsonb("days_of_week").$type<number[]>().notNull(), // 0=Sun..6=Sat
  startTime: text("start_time"),
  durationMin: integer("duration_min").notNull().default(15),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const habits = pgTable("habit", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  targetPerWeek: integer("target_per_week").notNull().default(5),
  skill: text("skill", { enum: ["money", "investing", "business", "discipline"] })
    .notNull()
    .default("discipline"),
  archived: boolean("archived").notNull().default(false),
  createdAt: createdAt(),
});

export const habitLogs = pgTable(
  "habit_log",
  {
    habitId: text("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.habitId, t.date] })],
);

export const focusSessions = pgTable("focus_session", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  plannedMin: integer("planned_min").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  completed: boolean("completed").notNull().default(false),
});

export const dailyReviews = pgTable(
  "daily_review",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kind: text("kind", { enum: ["morning", "evening"] }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date, t.kind] })],
);

export const weeklyReviews = pgTable(
  "weekly_review",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    /** Deterministic snapshot of figures shown during the review. */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    outcome: text("outcome", {
      enum: ["continue_plan", "build_reserves", "adjust_plan", "pay_down_debt", "no_decision"],
    }),
    reflection: text("reflection"),
    acceptedActions: jsonb("accepted_actions").$type<string[]>().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("weekly_review_user_week").on(t.userId, t.weekStart)],
);

/* ------------------------------------------------------------------ */
/* Gamification                                                       */
/* ------------------------------------------------------------------ */

export const SKILLS = ["money", "investing", "business", "discipline"] as const;
export type Skill = (typeof SKILLS)[number];

/**
 * Append-only XP ledger. `idempotencyKey` is unique per user, so the same meaningful
 * action can never award XP twice. Undo sets `revokedAt` rather than deleting.
 */
export const xpEvents = pgTable(
  "xp_event",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    action: text("action").notNull(),
    skill: text("skill", { enum: SKILLS }).notNull(),
    xp: integer("xp").notNull(),
    localDate: date("local_date").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("xp_user_key").on(t.userId, t.idempotencyKey),
    index("xp_user_date").on(t.userId, t.localDate),
  ],
);

export const unlockedCosmetics = pgTable(
  "unlocked_cosmetic",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cosmeticId: text("cosmetic_id").notNull(),
    equipped: boolean("equipped").notNull().default(false),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cosmeticId] })],
);

/* ------------------------------------------------------------------ */
/* Signals (news)                                                     */
/* ------------------------------------------------------------------ */

/** Shared across users. `isDemo` rows are illustrative and always labelled. */
export const newsItems = pgTable(
  "news_item",
  {
    id: id(),
    provider: text("provider").notNull(), // "demo" | "rss:<feedId>" | ...
    isDemo: boolean("is_demo").notNull().default(false),
    sourceName: text("source_name").notNull(),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull(),
    /** Normalised-title hash used to cluster overlapping coverage. */
    clusterKey: text("cluster_key").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    topic: text("topic").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    eventDate: date("event_date"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
    /** Structured explainer; see lib/ai/contracts.ts NewsExplainer. */
    explainer: jsonb("explainer").$type<Record<string, unknown>>(),
    explainerSource: text("explainer_source", { enum: ["editorial_demo", "ai", "none"] })
      .notNull()
      .default("none"),
  },
  (t) => [
    uniqueIndex("news_url_hash").on(t.urlHash),
    index("news_published_idx").on(t.publishedAt),
    index("news_cluster_idx").on(t.clusterKey),
  ],
);

export const newsBookmarks = pgTable(
  "news_bookmark",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    newsItemId: text("news_item_id")
      .notNull()
      .references(() => newsItems.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.newsItemId] })],
);

export const ingestionRuns = pgTable("ingestion_run", {
  id: id(),
  provider: text("provider").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status", { enum: ["running", "ok", "error"] }).notNull().default("running"),
  fetched: integer("fetched").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  error: text("error"),
});

/* ------------------------------------------------------------------ */
/* Integrations                                                       */
/* ------------------------------------------------------------------ */

/**
 * Per-user integration connection. Tokens are AES-256-GCM encrypted with
 * INTEGRATION_ENCRYPTION_KEY and never leave the server.
 */
export const integrations = pgTable(
  "integration",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["google_calendar"] }).notNull(),
    status: text("status", { enum: ["connected", "error", "revoked", "disconnected"] }).notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    encryptedAccessToken: text("encrypted_access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    externalAccountEmail: text("external_account_email"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("integration_user_provider").on(t.userId, t.provider)],
);

export const externalEvents = pgTable(
  "external_event",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
    eventId: text("event_id").notNull(),
    title: text("title"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    allDayDate: date("all_day_date"),
    allDayEndDate: date("all_day_end_date"),
    status: text("status"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("external_event_key").on(t.userId, t.calendarId, t.eventId)],
);

/** Mapping between app tasks and events the app itself created. Only these are ever modified. */
export const calendarPublications = pgTable(
  "calendar_publication",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // No FK: the mapping must outlive a deleted task so its event can still be removed.
    taskId: text("task_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    /** Deterministic event id derived from taskId so retries are idempotent. */
    eventId: text("event_id").notNull(),
    contentHash: text("content_hash").notNull(),
    status: text("status", { enum: ["published", "pending_delete", "deleted", "error"] }).notNull(),
    lastError: text("last_error"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("calendar_pub_task").on(t.userId, t.taskId)],
);

/* ------------------------------------------------------------------ */
/* Notifications and telemetry                                         */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notification",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    dedupeKey: text("dedupe_key").notNull(),
    deliverAfter: timestamp("deliver_after", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("notification_dedupe").on(t.userId, t.dedupeKey)],
);

export const pushSubscriptions = pgTable("push_subscription", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: createdAt(),
});

/** Usage telemetry for AI calls. Never stores prompts or outputs. */
export const aiUsage = pgTable("ai_usage", {
  id: id(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  feature: text("feature").notNull(),
  provider: text("provider").notNull(),
  model: text("model"),
  latencyMs: integer("latency_ms").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  outcome: text("outcome", { enum: ["ok", "invalid_output", "error", "fallback"] }).notNull(),
  createdAt: createdAt(),
});

/** Observability for scheduled jobs (the queue itself is pg-boss). */
export const jobRuns = pgTable(
  "job_run",
  {
    id: id(),
    job: text("job").notNull(),
    runKey: text("run_key").notNull(),
    status: text("status", { enum: ["running", "ok", "error"] }).notNull(),
    attempts: integer("attempts").notNull().default(1),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("job_run_key").on(t.job, t.runKey)],
);
