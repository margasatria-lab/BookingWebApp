"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { createSession, deleteSession } from "@/lib/session";

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUNDS = 12;

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", ROUNDS);

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const name = text(fd, "name");
  const email = text(fd, "email").toLowerCase();
  const mobile = text(fd, "mobile");
  const teamName = text(fd, "teamName");
  const tenantId = text(fd, "tenantId");
  const password = String(fd.get("password") ?? "");
  const fields = { name, email, mobile, teamName, tenantId };

  if (!name) return { error: "Enter your name.", fields };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", fields };
  if (password.length < 8 || password.length > 72) {
    return { error: "Password must be 8 to 72 characters.", fields };
  }
  if (!UUID_RE.test(tenantId)) return { error: "Choose a venue.", fields };

  const [tenant] = await db.select({ id: tenants.id }).from(tenants)
    .where(sql`${tenants.id} = ${tenantId} and ${tenants.status} = 'active'`);
  if (!tenant) return { error: "Choose a venue.", fields };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return { error: "That email is already registered. Log in instead.", fields };

  const passwordHash = await bcrypt.hash(password, ROUNDS);
  let userId: string;
  try {
    const [row] = await db.insert(users).values({
      tenantId, role: "member", name, email, mobile: mobile || null, teamName: teamName || null, passwordHash,
    }).returning({ id: users.id });
    userId = row.id;
  } catch {
    // Lost a race with another signup using the same email (unique constraint).
    return { error: "That email is already registered. Log in instead.", fields };
  }
  await createSession(userId);
  redirect("/dashboard");
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = text(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) return { error: "Invalid email or password.", fields: { email } };
  if (user.status === "pending_approval") return { error: "Your account is waiting for approval.", fields: { email } };
  if (user.status === "rejected") return { error: "Your account was not approved.", fields: { email } };
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
