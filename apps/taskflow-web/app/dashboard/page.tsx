"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FolderKanban, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SessionGuard } from "@/components/SessionGuard";
import { api, json, Workspace } from "@/lib/api";

export default function Dashboard() {
  return (
    <SessionGuard>{(user) => <DashboardContent user={user} />}</SessionGuard>
  );
}
function DashboardContent({
  user,
}: {
  user: { id: string; name: string; email: string };
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    api<{ workspaces: Workspace[] }>("/api/workspaces")
      .then((r) => setWorkspaces(r.workspaces))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const { workspace } = await api<{ workspace: Workspace }>(
        "/api/workspaces",
        json("POST", { name, description }),
      );
      window.location.href = `/workspaces/${workspace.id}`;
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(false);
    }
  }
  return (
    <AppShell user={user} workspaces={workspaces}>
      <div className="content-container">
        <div className="page-heading">
          <div>
            <span className="section-kicker">YOUR OVERVIEW</span>
            <h1>
              Good morning, {user.name.split(" ")[0]}
              <span className="heading-period">.</span>
            </h1>
            <p>Pick up where your team left off.</p>
          </div>
        </div>
        {loading ? (
          <div className="empty-panel">Loading your workspaces…</div>
        ) : (
          <>
            <div className="dashboard-grid">
              <section>
                <div className="section-head">
                  <h2>Your workspaces</h2>
                  <span>{workspaces.length} total</span>
                </div>
                {workspaces.length ? (
                  <div className="workspace-grid">
                    {workspaces.map((w) => (
                      <Link
                        href={`/workspaces/${w.id}`}
                        key={w.id}
                        className="workspace-card"
                      >
                        <div className="workspace-card-icon">
                          {w.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <h3>{w.name}</h3>
                          <p>
                            {w.description || "A shared space for your team."}
                          </p>
                        </div>
                        <div className="workspace-card-footer">
                          <span>
                            <FolderKanban size={15} /> {w._count?.boards ?? 0}{" "}
                            boards
                          </span>
                          <span>
                            <Users size={15} /> {w._count?.members ?? 1} members
                          </span>
                          <ArrowRight size={17} />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="empty-panel">
                    <div className="empty-icon">
                      <FolderKanban size={25} />
                    </div>
                    <h3>Your first workspace is one step away.</h3>
                    <p>Give your team a place to plan and keep work moving.</p>
                  </div>
                )}
              </section>
              <section className="create-panel">
                <div className="create-panel-icon">
                  <Plus size={22} />
                </div>
                <h2>Create a workspace</h2>
                <p>Make room for a new project or team.</p>
                <form onSubmit={create}>
                  <label>
                    Workspace name
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      required
                      placeholder="e.g. Product team"
                    />
                  </label>
                  <label>
                    Description <span className="optional">optional</span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="What will you work on together?"
                    />
                  </label>
                  <button className="button primary full" disabled={creating}>
                    {creating ? "Creating…" : "Create workspace"}
                    <ArrowRight size={16} />
                  </button>
                </form>
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
