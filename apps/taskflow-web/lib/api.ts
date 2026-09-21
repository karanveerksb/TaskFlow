export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";
export type User = { id: string; name: string; email: string };
export type Member = { role: "OWNER" | "MEMBER"; user: User };
export type Assignee = { user: User };
export type Task = {
  id: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  columnId: string;
  position: number;
  assignees: Assignee[];
  _count: { comments: number };
};
export type Column = {
  id: string;
  name: string;
  position: number;
  tasks: Task[];
};
export type Activity = {
  id: string;
  action: string;
  metadata: Record<string, string>;
  createdAt: string;
  actor: { name: string };
};
export type Board = {
  id: string;
  name: string;
  workspaceId: string;
  workspace: { id: string; name: string; members: Member[] };
  columns: Column[];
  activities: Activity[];
};
export type Workspace = {
  id: string;
  name: string;
  description?: string | null;
  role?: "OWNER" | "MEMBER";
  _count?: { members: number; boards: number };
  boards?: Array<{ id: string; name: string; _count: { tasks: number } }>;
  members?: Member[];
  activities?: Activity[];
};

export function token() {
  return typeof window === "undefined"
    ? null
    : sessionStorage.getItem("taskflow_token");
}
export function saveSession(value: string) {
  sessionStorage.setItem("taskflow_token", value);
}
export function clearSession() {
  sessionStorage.removeItem("taskflow_token");
}
export function authReturnPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : "/dashboard";
}
export function authPageHref(mode: "login" | "signup", path: string) {
  return `/${mode}?next=${encodeURIComponent(authReturnPath(path))}`;
}
export function loginHref(path: string) {
  return authPageHref("login", path);
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...options.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      message = (await response.json()).message || message;
    } catch {
      /* no response body */
    }
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !path.startsWith("/api/auth/")
    ) {
      clearSession();
      window.location.href = loginHref(
        window.location.pathname + window.location.search,
      );
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
