import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { signup } from "@/app/actions/auth";
import AuthForm from "@/app/ui/auth-form";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getCurrentUser } from "@/lib/dal";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const list = await db.select({ id: tenants.id, name: tenants.name }).from(tenants)
    .where(eq(tenants.status, "active")).orderBy(tenants.name);
  return <AuthForm mode="signup" action={signup} tenants={list} />;
}
