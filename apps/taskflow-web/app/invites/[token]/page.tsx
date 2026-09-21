"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SessionGuard } from "@/components/SessionGuard";
import { api, json } from "@/lib/api";

export default function InvitePage() {
  return <SessionGuard>{() => <AcceptInvite />}</SessionGuard>;
}
function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function accept() {
    setLoading(true);
    try {
      const { workspaceId } = await api<{ workspaceId: string }>(
        `/api/workspaces/invites/${token}/accept`,
        json("POST", {}),
      );
      toast.success("Welcome to the workspace.");
      router.push(`/workspaces/${workspaceId}`);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }
  return (
    <div className="invite-page">
      <Link href="/dashboard" className="brand">
        <span className="brand-mark">✳</span> TaskFlow
        <span className="brand-dot">.</span>
      </Link>
      <div className="invite-card">
        <span className="section-kicker">YOU'RE INVITED</span>
        <h1>Work is better together.</h1>
        <p>Accept this invitation to join your teammate&apos;s workspace.</p>
        {error && <div className="form-error">{error}</div>}
        <button
          className="button primary full"
          onClick={accept}
          disabled={loading}
        >
          {loading ? "Joining…" : "Accept invitation"}
        </button>
        <Link href="/dashboard" className="text-link">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
