import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// --- Enums --------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", [
  "platform_admin",
  "admin",
  "member",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "pending_approval",
  "rejected",
]);

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "suspended",
]);

export const slotStatusEnum = pgEnum("slot_status", [
  "open",
  "held",
  "booked",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "auto_approved",
  "pending_approval",
  "confirmed",
  "rejected",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending_manual",
  "paid",
  "refunded",
]);

// --- Platform ------------------------------------------------------------

// A venue business onboarded onto the platform by the Platform Admin.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  subscriptionEndDate: date("subscription_end_date"),
  status: tenantStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// Global, category-agnostic lookup: table_tennis today, others later.
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  fieldSchema: jsonb("field_schema"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// Unified principal table for all three roles. Platform Admin has no
// tenant_id; Admin and Member are scoped to the tenant they belong to.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    role: userRoleEnum("role").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    mobile: text("mobile"),
    teamName: text("team_name"),
    passwordHash: text("password_hash").notNull(),
    status: userStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    tenantIdx: index("users_tenant_id_idx").on(table.tenantId),
    roleIdx: index("users_role_idx").on(table.role),
  })
);

// Opaque session tokens for the self-built auth (httpOnly cookie holds the id).
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdx: index("sessions_user_id_idx").on(table.userId),
  })
);

// --- Tenant-owned: facilities & availability -----------------------------

export const facilities = pgTable(
  "facilities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull().default(1),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    tenantIdx: index("facilities_tenant_id_idx").on(table.tenantId),
  })
);

export const availabilitySlots = pgTable(
  "availability_slots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    status: slotStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    // Prevents double-booking the same facility for the same start time.
    facilityStartUnique: uniqueIndex("availability_slots_facility_start_idx").on(
      table.facilityId,
      table.startAt
    ),
    // Speeds up "list availability for this facility, this window, open only".
    lookupIdx: index("availability_slots_lookup_idx").on(
      table.facilityId,
      table.startAt,
      table.status
    ),
  })
);

// --- Packages --------------------------------------------------------------

export const packages = pgTable(
  "packages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sessionCount: integer("session_count").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    validityDays: integer("validity_days").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    tenantIdx: index("packages_tenant_id_idx").on(table.tenantId),
  })
);

// A member's purchased instance of a package: the "wallet" that bookings
// auto-deduct from.
export const memberPackages = pgTable(
  "member_packages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    memberId: uuid("member_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id),
    sessionsRemaining: integer("sessions_remaining").notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    memberIdx: index("member_packages_member_id_idx").on(table.memberId),
  })
);

// --- Bookings & payments -----------------------------------------------

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => availabilitySlots.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => users.id),
    memberPackageId: uuid("member_package_id").references(
      () => memberPackages.id
    ),
    status: bookingStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    slotIdx: index("bookings_slot_id_idx").on(table.slotId),
    memberIdx: index("bookings_member_id_idx").on(table.memberId),
  })
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid("booking_id").references(() => bookings.id),
    memberPackageId: uuid("member_package_id").references(
      () => memberPackages.id
    ),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    // Gateway integration is deferred; this is a manual/mock flag for now.
    method: text("method"),
    status: paymentStatusEnum("status").notNull().default("pending_manual"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    bookingIdx: index("payments_booking_id_idx").on(table.bookingId),
    memberPackageIdx: index("payments_member_package_id_idx").on(
      table.memberPackageId
    ),
  })
);
