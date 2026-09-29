import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./index";
import {
  tenants,
  categories,
  users,
  facilities,
  availabilitySlots,
  packages,
  memberPackages,
  bookings,
} from "./schema";

// Sample data mirroring the design mockups (Meridian Table Tennis Club),
// so the app has something real to render against right away.
async function main() {
  console.log("Seeding...");

  const [tableTennis] = await db
    .insert(categories)
    .values({ name: "table_tennis" })
    .returning();

  const [meridian] = await db
    .insert(tenants)
    .values({
      name: "Meridian Table Tennis Club",
      subscriptionEndDate: "2027-09-21",
      status: "active",
    })
    .returning();

  const passwordHash = await bcrypt.hash("password123", 10);

  const [platformAdmin] = await db
    .insert(users)
    .values({
      role: "platform_admin",
      name: "Platform Admin",
      email: "platform-admin@example.com",
      passwordHash,
      status: "active",
    })
    .returning();

  const [admin] = await db
    .insert(users)
    .values({
      tenantId: meridian.id,
      role: "admin",
      name: "Meridian Admin",
      email: "admin@meridian.example.com",
      passwordHash,
      status: "active",
    })
    .returning();

  const [member] = await db
    .insert(users)
    .values({
      tenantId: meridian.id,
      role: "member",
      name: "Alex Tan",
      email: "alex@email.com",
      mobile: "+62 812 3456 789",
      passwordHash,
      status: "active",
    })
    .returning();

  const [table3] = await db
    .insert(facilities)
    .values({
      tenantId: meridian.id,
      categoryId: tableTennis.id,
      name: "Table 3",
      capacity: 4,
      location: "Central Jakarta",
    })
    .returning();

  // A handful of 45-minute slots starting tomorrow morning.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);

  const slotTimes: Date[] = [];
  for (let i = 0; i < 6; i++) {
    slotTimes.push(new Date(tomorrow.getTime() + i * 45 * 60 * 1000));
  }

  const insertedSlots = await db
    .insert(availabilitySlots)
    .values(
      slotTimes.map((startAt) => ({
        facilityId: table3.id,
        startAt,
        endAt: new Date(startAt.getTime() + 45 * 60 * 1000),
        price: "60000.00",
        status: "open" as const,
      }))
    )
    .returning();

  const [regularPackage] = await db
    .insert(packages)
    .values({
      tenantId: meridian.id,
      name: "Regular",
      sessionCount: 10,
      price: "440000.00",
      validityDays: 60,
    })
    .returning();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + regularPackage.validityDays);

  const [memberWallet] = await db
    .insert(memberPackages)
    .values({
      memberId: member.id,
      packageId: regularPackage.id,
      sessionsRemaining: 3,
      expiresAt,
    })
    .returning();

  // One auto-approved booking against the member's package, on the first slot.
  await db.insert(bookings).values({
    slotId: insertedSlots[0].id,
    memberId: member.id,
    memberPackageId: memberWallet.id,
    status: "auto_approved",
  });

  console.log("Seed complete:");
  console.log({
    platformAdmin: platformAdmin.email,
    admin: admin.email,
    member: member.email,
    note: "All seeded users share the password: password123",
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
