import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/dal";

// Placeholder landing page for every role until the role-specific screens exist.
export default async function Dashboard() {
  const user = await requireUser();
  return (
    <main className="auth-card">
      <h1>Hi, {user.name}</h1>
      <p className="auth-alt">Signed in as {user.email} ({user.role.replace("_", " ")})</p>
      <form action={logout}><button type="submit">Log out</button></form>
    </main>
  );
}
