import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import AuthForm from "@/app/ui/auth-form";
import { getCurrentUser } from "@/lib/dal";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <AuthForm mode="login" action={login} />;
}
