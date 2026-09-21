"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import { clearSession, User, Workspace } from "@/lib/api";

export function AppShell({
  user,
  workspaces,
  activeWorkspaceId,
  children,
}: {
  user: User;
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  return (
    <div className="app-frame">
      <header className="topbar">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">✳</span> TaskFlow
          <span className="brand-dot">.</span>
        </Link>
        <div className="topbar-right">
          <span className="topbar-workspace">
            {active?.name ?? "Your workspaces"}
          </span>
          <span className="avatar" title={user.name}>
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <button
            className="icon-button"
            title="Log out"
            onClick={() => {
              clearSession();
              router.push("/");
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-section-title">WORKSPACE</div>
          <Link href="/dashboard" className="sidebar-link">
            <LayoutDashboard size={17} /> Overview
          </Link>
          <div className="workspace-select">
            <span className="workspace-icon">
              {active?.name.slice(0, 1).toUpperCase() ?? "W"}
            </span>
            <span>{active?.name ?? "Select a workspace"}</span>
            <ChevronDown size={14} />
          </div>
          <div className="sidebar-section-title">YOUR SPACES</div>
          <nav>
            {workspaces.map((w) => (
              <Link
                key={w.id}
                href={`/workspaces/${w.id}`}
                className={`sidebar-link ${activeWorkspaceId === w.id ? "active" : ""}`}
              >
                <span className="sidebar-dot" />
                {w.name}
              </Link>
            ))}
          </nav>
          <Link href="/dashboard" className="sidebar-link subtle">
            <Plus size={16} /> New workspace
          </Link>
          {active && (
            <>
              <div className="sidebar-section-title with-gap">
                IN THIS WORKSPACE
              </div>
              <Link href={`/workspaces/${active.id}`} className="sidebar-link">
                <LayoutDashboard size={17} /> Boards & activity
              </Link>
              <a
                href={`/workspaces/${active.id}#members`}
                className="sidebar-link"
              >
                <Users size={17} /> Members
              </a>
              <a
                href={`/workspaces/${active.id}#activity`}
                className="sidebar-link"
              >
                <Activity size={17} /> Activity
              </a>
            </>
          )}
        </aside>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
