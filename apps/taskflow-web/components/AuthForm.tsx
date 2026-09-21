"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api, json, saveSession, User } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api<{ user: User; token: string }>(
        `/api/auth/${mode}`,
        json("POST", data),
      );
      saveSession(result.token);
      router.push(
        params.get("next")?.startsWith("/")
          ? params.get("next")!
          : "/dashboard",
      );
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-header">
        <Link href="/" className="brand">
          <span className="brand-mark">✳</span> TaskFlow
          <span className="brand-dot">.</span>
        </Link>
        <Link href="/" className="text-link">
          Back to home
        </Link>
      </div>
      <div className="auth-content">
        <div className="auth-copy">
          <span className="section-kicker">YOUR WORK, TOGETHER</span>
          <h1>Good work starts with a clear plan.</h1>
          <p>
            Give every project a home, every task an owner, and everyone the
            same view of what&apos;s next.
          </p>
          <div className="auth-illustration">
            <div className="illustration-card">
              <span className="pill rust">In progress</span>
              <strong>Launch the new experience</strong>
              <span className="illustration-meta">
                Updated just now <span>→</span> On track
              </span>
            </div>
            <div className="illustration-card offset">
              <span className="pill green">Done</span>
              <strong>Align with the team</strong>
              <span className="illustration-meta">
                A little progress, every day.
              </span>
            </div>
          </div>
        </div>
        <div className="auth-panel">
          <span className="section-kicker">WELCOME TO TASKFLOW</span>
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p>
            {mode === "login"
              ? "Pick up where your team left off."
              : "Your next project starts here."}
          </p>
          <form onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  placeholder="Your name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                placeholder="At least 8 characters"
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full" disabled={loading}>
              {loading
                ? "One moment…"
                : mode === "login"
                  ? "Log in"
                  : "Create account"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? "New to TaskFlow?" : "Already have an account?"}{" "}
            <Link href={mode === "login" ? "/signup" : "/login"}>
              {mode === "login" ? "Create an account" : "Log in"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
