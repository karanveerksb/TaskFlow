"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Copy,
  FolderKanban,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SessionGuard } from "@/components/SessionGuard";
import { api, json, Workspace } from "@/lib/api";

export default function WorkspacePage() {
  return (
    <SessionGuard>{(user) => <WorkspaceContent user={user} />}</SessionGuard>
  );
}
function WorkspaceContent({
  user,
}: {
  user: { id: string; name: string; email: string };
}) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [boardName, setBoardName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const load = useCallback(() => {
    Promise.all([
      api<{ workspaces: Workspace[] }>("/api/workspaces"),
      api<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}`),
    ])
      .then(([list, detail]) => {
        setWorkspaces(list.workspaces);
        setWorkspace(detail.workspace);
        setWorkspaceName(detail.workspace.name);
        setWorkspaceDescription(detail.workspace.description ?? "");
      })
      .catch((e) => setError(e.message));
  }, [workspaceId]);
  useEffect(() => {
    load();
  }, [load]);
  async function createBoard(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { board } = await api<{ board: { id: string } }>(
        `/api/workspaces/${workspaceId}/boards`,
        json("POST", { name: boardName }),
      );
      window.location.href = `/workspaces/${workspaceId}/boards/${board.id}`;
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await api<{ token: string }>(
        `/api/workspaces/${workspaceId}/invites`,
        json("POST", { email: inviteEmail }),
      );
      setInviteUrl(`${window.location.origin}/invites/${result.token}`);
      toast.success("Invitation link ready to share.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function saveWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setSavingWorkspace(true);
    try {
      const { workspace: updated } = await api<{ workspace: Workspace }>(
        `/api/workspaces/${workspaceId}`,
        json("PATCH", {
          name: workspaceName,
          description: workspaceDescription,
        }),
      );
      setWorkspace((current) => current && { ...current, ...updated });
      setWorkspaces((current) =>
        current.map((item) =>
          item.id === workspaceId ? { ...item, ...updated } : item,
        ),
      );
      setWorkspaceName(updated.name);
      setWorkspaceDescription(updated.description ?? "");
      toast.success("Workspace settings saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingWorkspace(false);
    }
  }
  async function removeMember(memberId: string, memberName: string) {
    if (!window.confirm(`Remove ${memberName} from this workspace?`)) return;
    setRemovingMemberId(memberId);
    try {
      await api(`/api/workspaces/${workspaceId}/members/${memberId}`, {
        method: "DELETE",
      });
      setWorkspace((current) =>
        current && {
          ...current,
          members: current.members?.filter(
            (member) => member.user.id !== memberId,
          ),
        },
      );
      setWorkspaces((current) =>
        current.map((item) =>
          item.id === workspaceId && item._count
            ? {
                ...item,
                _count: { ...item._count, members: item._count.members - 1 },
              }
            : item,
        ),
      );
      toast.success(`${memberName} was removed.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRemovingMemberId(null);
    }
  }
  const isOwner =
    workspaces.find((item) => item.id === workspaceId)?.role === "OWNER";
  return (
    <AppShell
      user={user}
      workspaces={workspaces}
      activeWorkspaceId={workspaceId}
    >
      <div className="content-container">
        {error ? (
          <div className="empty-panel">
            <h2>Unable to open workspace</h2>
            <p>{error}</p>
            <Link href="/dashboard" className="button secondary">
              Back to dashboard
            </Link>
          </div>
        ) : !workspace ? (
          <div className="empty-panel">Loading workspace…</div>
        ) : (
          <>
            <div className="page-heading workspace-heading">
              <div>
                <span className="section-kicker">WORKSPACE OVERVIEW</span>
                <h1>
                  {workspace.name}
                  <span className="heading-period">.</span>
                </h1>
                <p>
                  {workspace.description ||
                    "Where your team keeps work moving."}
                </p>
              </div>
              <span className="role-badge">
                {isOwner ? "OWNER" : "MEMBER"}
              </span>
            </div>
            <div className="stats-row">
              <div>
                <FolderKanban size={19} />
                <strong>{workspace.boards?.length ?? 0}</strong>
                <span>Project boards</span>
              </div>
              <div>
                <Users size={19} />
                <strong>{workspace.members?.length ?? 0}</strong>
                <span>Team members</span>
              </div>
              <div>
                <Activity size={19} />
                <strong>{workspace.activities?.length ?? 0}</strong>
                <span>Recent updates</span>
              </div>
            </div>
            <div className="workspace-layout">
              <div>
                <section className="surface-section">
                  <div className="section-head">
                    <div>
                      <span className="section-kicker">PROJECTS</span>
                      <h2>Boards</h2>
                    </div>
                  </div>
                  {workspace.boards?.length ? (
                    <div className="board-list">
                      {workspace.boards.map((board) => (
                        <Link
                          href={`/workspaces/${workspaceId}/boards/${board.id}`}
                          className="board-list-item"
                          key={board.id}
                        >
                          <span className="board-list-icon">
                            <FolderKanban size={21} />
                          </span>
                          <div>
                            <strong>{board.name}</strong>
                            <small>{board._count.tasks} tasks</small>
                          </div>
                          <ArrowRight size={18} />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="mini-empty">
                      No boards yet. Create your first project board.
                    </div>
                  )}
                  {isOwner && (
                    <form className="inline-form" onSubmit={createBoard}>
                      <input
                        value={boardName}
                        onChange={(e) => setBoardName(e.target.value)}
                        placeholder="New board name"
                        maxLength={80}
                        required
                      />
                      <button className="button primary">
                        <Plus size={16} /> Create board
                      </button>
                    </form>
                  )}
                </section>
                {isOwner && (
                  <section
                    className="surface-section workspace-settings"
                    id="settings"
                  >
                    <div className="section-head">
                      <div>
                        <span className="section-kicker">MAKE IT YOURS</span>
                        <h2>Workspace settings</h2>
                      </div>
                    </div>
                    <form onSubmit={saveWorkspace}>
                      <label>
                        Workspace name
                        <input
                          value={workspaceName}
                          onChange={(e) => setWorkspaceName(e.target.value)}
                          maxLength={80}
                          required
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          value={workspaceDescription}
                          onChange={(e) =>
                            setWorkspaceDescription(e.target.value)
                          }
                          maxLength={500}
                          rows={3}
                        />
                      </label>
                      <button
                        className="button primary"
                        disabled={savingWorkspace}
                      >
                        {savingWorkspace ? "Saving…" : "Save changes"}
                      </button>
                    </form>
                  </section>
                )}
                <section className="surface-section" id="activity">
                  <div className="section-head">
                    <div>
                      <span className="section-kicker">WHAT'S NEW</span>
                      <h2>Recent activity</h2>
                    </div>
                  </div>
                  {workspace.activities?.length ? (
                    <div className="activity-list">
                      {workspace.activities.map((item) => (
                        <div className="activity-item" key={item.id}>
                          <span className="activity-dot" />
                          <p>
                            <strong>{item.actor.name}</strong>{" "}
                            {activityText(item.action, item.metadata)}
                          </p>
                          <time>
                            {new Date(item.createdAt).toLocaleDateString()}
                          </time>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mini-empty">
                      Activity will appear here as your team works.
                    </div>
                  )}
                </section>
              </div>
              <aside>
                <section className="surface-section" id="members">
                  <div className="section-head">
                    <div>
                      <span className="section-kicker">YOUR PEOPLE</span>
                      <h2>Members</h2>
                    </div>
                  </div>
                  <div className="member-list">
                    {workspace.members?.map((member) => (
                      <div className="member-item" key={member.user.id}>
                        <span className="avatar small">
                          {member.user.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <strong>{member.user.name}</strong>
                          <small>{member.user.email}</small>
                        </div>
                        <span className="member-role role-badge">
                          {member.role}
                        </span>
                        {isOwner && member.role === "MEMBER" && (
                          <button
                            type="button"
                            className="delete-button member-remove"
                            onClick={() =>
                              removeMember(member.user.id, member.user.name)
                            }
                            disabled={removingMemberId !== null}
                            aria-label={`Remove ${member.user.name}`}
                          >
                            {removingMemberId === member.user.id
                              ? "Removing…"
                              : "Remove"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {isOwner && (
                    <form className="invite-form" onSubmit={invite}>
                      <label>
                        Invite a teammate by email
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="teammate@company.com"
                          required
                        />
                      </label>
                      <button className="button secondary full" type="submit">
                        Create invite link <ArrowRight size={15} />
                      </button>
                      {inviteUrl && (
                        <div className="invite-link">
                          <input readOnly value={inviteUrl} />
                          <button
                            type="button"
                            title="Copy link"
                            onClick={async () => {
                              await navigator.clipboard.writeText(inviteUrl);
                              toast.success("Invite link copied.");
                            }}
                          >
                            <Copy size={16} />
                          </button>
                        </div>
                      )}
                    </form>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
function activityText(action: string, metadata: Record<string, string>) {
  const title = metadata?.title || metadata?.name || "an item";
  switch (action) {
    case "TASK_CREATED":
      return `created “${title}”`;
    case "TASK_UPDATED":
      return `updated “${title}”`;
    case "TASK_MOVED":
      return `moved “${title}”`;
    case "TASK_DELETED":
      return `deleted “${title}”`;
    case "BOARD_CREATED":
      return `created board “${title}”`;
    case "COMMENT_CREATED":
      return `commented on “${title}”`;
    case "MEMBER_JOINED":
      return "joined the workspace";
    default:
      return action.toLowerCase().replaceAll("_", " ");
  }
}
