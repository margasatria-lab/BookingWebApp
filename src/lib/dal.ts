import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { readSessionToken } from "./session";

export type Role = "platform_admin" | "admin" | "member";

// Data access layer: the one place that turns a session cookie into a user.
export const getCurrentUser = cache(async () => {
  const id = await readSessionToken();
  if (!id) return null;
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      tenantId: users.tenantId,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  if (!row || row.expiresAt < new Date() || row.status !== "active") return null;
  return row;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export function homeFor(role: Role) {
  return role === "platform_admin" ? "/platform" : role === "admin" ? "/admin" : "/dashboard";
}
