"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";

type Tenant = { id: string; name: string };

export default function AuthForm({
  mode,
  action,
  tenants = [],
}: {
  mode: "login" | "signup";
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  tenants?: Tenant[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const f = state?.fields ?? {};
  const signup = mode === "signup";

  return (
    <main className="auth-card">
      <h1>{signup ? "Create your account" : "Welcome back"}</h1>
      <form action={formAction}>
        {signup && (
          <>
            <label htmlFor="tenantId">Venue
              <select id="tenantId" name="tenantId" defaultValue={f.tenantId ?? ""} required>
                <option value="" disabled>Choose a venue</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label htmlFor="name">Name
              <input id="name" name="name" autoComplete="name" defaultValue={f.name} required />
            </label>
          </>
        )}
        <label htmlFor="email">Email
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={f.email} required />
        </label>
        {signup && (
          <>
            <label htmlFor="mobile">Mobile (optional)
              <input id="mobile" name="mobile" type="tel" autoComplete="tel" defaultValue={f.mobile} />
            </label>
            <label htmlFor="teamName">Team name (optional)
              <input id="teamName" name="teamName" defaultValue={f.teamName} />
            </label>
          </>
        )}
        <label htmlFor="password">Password
          <input id="password" name="password" type="password" minLength={signup ? 8 : undefined}
            autoComplete={signup ? "new-password" : "current-password"} required />
        </label>
        <p className="form-error" role="alert">{state?.error}</p>
        <button type="submit" disabled={pending}>{pending ? "Please wait…" : signup ? "Sign up" : "Log in"}</button>
      </form>
      <p className="auth-alt">
        {signup ? <>Have an account? <Link href="/login">Log in</Link></> : <>New here? <Link href="/signup">Sign up</Link></>}
      </p>
    </main>
  );
}
