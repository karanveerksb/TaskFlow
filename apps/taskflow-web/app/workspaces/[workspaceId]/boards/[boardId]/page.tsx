"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity as ActivityIcon,
  CalendarDays,
  ChevronRight,
  GripVertical,
  MessageCircle,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SessionGuard } from "@/components/SessionGuard";
import {
  Activity,
  api,
  Board,
  Column,
  json,
  Task,
  token,
  Workspace,
  WS_URL,
} from "@/lib/api";

export default function BoardPage() {
  return <SessionGuard>{(user) => <BoardContent user={user} />}</SessionGuard>;
}
function BoardContent({
  user,
}: {
  user: { id: string; name: string; email: string };
}) {
  const { workspaceId, boardId } = useParams<{
    workspaceId: string;
    boardId: string;
  }>();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [columnFilter, setColumnFilter] = useState("");
  const [newColumn, setNewColumn] = useState("");
  const [showColumnForm, setShowColumnForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const load = useCallback(async () => {
    try {
      const [list, detail] = await Promise.all([
        api<{ workspaces: Workspace[] }>("/api/workspaces"),
        api<{ board: Board }>(`/api/boards/${boardId}`),
      ]);
      setWorkspaces(list.workspaces);
      setBoard(detail.board);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [boardId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socket.onopen = () =>
      socket.send(JSON.stringify({ type: "AUTH", token: token() }));
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as {
        type: string;
        boardId?: string;
        message?: string;
      };
      if (message.type === "AUTH_OK")
        socket.send(JSON.stringify({ type: "JOIN_BOARD", boardId }));
      else if (message.type === "ACCESS_REVOKED") {
        setError("You no longer have access to this board.");
        setBoard(null);
      } else if (message.boardId === boardId && message.type !== "JOINED_BOARD")
        load();
    };
    return () => socket.close();
  }, [boardId, load]);
  const filtered = useMemo(
    () =>
      board?.columns
        .filter((c) => !columnFilter || c.id === columnFilter)
        .map((c) => ({
          ...c,
          tasks: c.tasks.filter(
            (t) =>
              t.title.toLowerCase().includes(search.toLowerCase()) &&
              (!priority || t.priority === priority) &&
              (!assignee || t.assignees.some((a) => a.user.id === assignee)),
          ),
        })) ?? [],
    [board, search, priority, assignee, columnFilter],
  );
  const hasFilters = !!(search || priority || assignee || columnFilter);
  async function addColumn(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(
        `/api/boards/${boardId}/columns`,
        json("POST", { name: newColumn }),
      );
      setNewColumn("");
      setShowColumnForm(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!board || !over || hasFilters || active.id === over.id) return;
    const source = board.columns.find((c) =>
      c.tasks.some((t) => t.id === active.id),
    );
    const target = board.columns.find(
      (c) => c.id === over.id || c.tasks.some((t) => t.id === over.id),
    );
    if (!source || !target) return;
    const moving = source.tasks.find((t) => t.id === active.id)!;
    const next: Board = {
      ...board,
      columns: board.columns.map((c) => ({
        ...c,
        tasks: c.tasks.filter((t) => t.id !== active.id).map((t) => ({ ...t })),
      })),
    };
    const targetTasks = next.columns.find((c) => c.id === target.id)!.tasks;
    const overIndex = targetTasks.findIndex((t) => t.id === over.id);
    const movingDown =
      source.id === target.id &&
      source.tasks.findIndex((t) => t.id === active.id) <
        source.tasks.findIndex((t) => t.id === over.id);
    const targetIndex =
      overIndex < 0 ? targetTasks.length : overIndex + (movingDown ? 1 : 0);
    targetTasks.splice(targetIndex, 0, { ...moving, columnId: target.id });
    next.columns.forEach((c) =>
      c.tasks.forEach((t, i) => {
        t.position = i;
      }),
    );
    setBoard(next);
    api(
      `/api/tasks/${moving.id}/move`,
      json("POST", { targetColumnId: target.id, targetIndex }),
    ).catch(async (e) => {
      toast.error(`Move failed: ${(e as Error).message}`);
      await load();
    });
  }
  return (
    <AppShell
      user={user}
      workspaces={workspaces}
      activeWorkspaceId={workspaceId}
    >
      <div className="board-page">
        {error ? (
          <div className="empty-panel">
            <h2>Unable to open board</h2>
            <p>{error}</p>
          </div>
        ) : !board ? (
          <div className="empty-panel">Loading board…</div>
        ) : (
          <>
            <div className="board-header">
              <div>
                <div className="breadcrumb">
                  {board.workspace.name} <ChevronRight size={14} /> Boards
                </div>
                <h1>
                  {board.name}
                  <span className="heading-period">.</span>
                </h1>
                <p>A clear view of what&apos;s next.</p>
              </div>
              <div className="board-header-actions">
                <div className="member-avatars">
                  {board.workspace.members.slice(0, 4).map((m) => (
                    <span
                      className="avatar small"
                      key={m.user.id}
                      title={m.user.name}
                    >
                      {m.user.name.slice(0, 1).toUpperCase()}
                    </span>
                  ))}
                  {board.workspace.members.length > 4 && (
                    <span className="avatar small more">
                      +{board.workspace.members.length - 4}
                    </span>
                  )}
                </div>
                <button
                  className={`button secondary compact ${showActivity ? "is-on" : ""}`}
                  onClick={() => setShowActivity(!showActivity)}
                >
                  <ActivityIcon size={16} /> Activity
                </button>
              </div>
            </div>
            <div className="board-toolbar">
              <label className="search-box">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tasks"
                />
              </label>
              <div className="toolbar-filters">
                <SlidersHorizontal size={17} />
                <select
                  aria-label="Filter by priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="">All priorities</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
                <select
                  aria-label="Filter by assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">All assignees</option>
                  {board.workspace.members.map((m) => (
                    <option value={m.user.id} key={m.user.id}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by column"
                  value={columnFilter}
                  onChange={(e) => setColumnFilter(e.target.value)}
                >
                  <option value="">All columns</option>
                  {board.columns.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {hasFilters && (
                  <button
                    className="clear-filters"
                    onClick={() => {
                      setSearch("");
                      setPriority("");
                      setAssignee("");
                      setColumnFilter("");
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {hasFilters && (
              <div className="filter-note">
                Clear filters to rearrange tasks.
              </div>
            )}
            <div className="board-content-row">
              <div className="kanban-scroll">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragEnd={onDragEnd}
                >
                  <div className="kanban-columns">
                    {filtered.map((c) => (
                      <KanbanColumn
                        key={c.id}
                        column={c}
                        disabled={hasFilters}
                        onTaskClick={setSelectedTask}
                        onRefresh={load}
                      />
                    ))}
                    <div className="add-column-wrap">
                      {showColumnForm ? (
                        <form className="add-column-form" onSubmit={addColumn}>
                          <input
                            autoFocus
                            value={newColumn}
                            onChange={(e) => setNewColumn(e.target.value)}
                            maxLength={60}
                            required
                            placeholder="Column name"
                          />
                          <div>
                            <button
                              className="button primary compact"
                              type="submit"
                            >
                              Add column
                            </button>
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => setShowColumnForm(false)}
                            >
                              <X size={17} />
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          className="add-column-button"
                          onClick={() => setShowColumnForm(true)}
                        >
                          <Plus size={18} /> Add a column
                        </button>
                      )}
                    </div>
                  </div>
                </DndContext>
              </div>
              {showActivity && (
                <aside className="board-activity">
                  <div className="section-head">
                    <h2>Board activity</h2>
                    <button
                      className="icon-button"
                      onClick={() => setShowActivity(false)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  {board.activities.length ? (
                    board.activities.map((a) => (
                      <div className="board-activity-item" key={a.id}>
                        <span className="activity-dot" />
                        <p>
                          <strong>{a.actor.name}</strong> {activityText(a)}
                        </p>
                        <small>{new Date(a.createdAt).toLocaleString()}</small>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Updates will appear here.</p>
                  )}
                </aside>
              )}
            </div>
            {selectedTask && (
              <TaskPanel
                key={selectedTask}
                taskId={selectedTask}
                board={board}
                onClose={() => setSelectedTask(null)}
                onRefresh={load}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
function activityText(a: Activity) {
  const title = a.metadata?.title || a.metadata?.name || "an item";
  return (
    (
      {
        TASK_CREATED: `created “${title}”`,
        TASK_UPDATED: `updated “${title}”`,
        TASK_MOVED: `moved “${title}”`,
        TASK_DELETED: `deleted “${title}”`,
        COMMENT_CREATED: `commented on “${title}”`,
        COLUMN_CREATED: `created column “${title}”`,
      } as Record<string, string>
    )[a.action] || a.action.toLowerCase().replaceAll("_", " ")
  );
}
function KanbanColumn({
  column,
  disabled,
  onTaskClick,
  onRefresh,
}: {
  column: Column;
  disabled: boolean;
  onTaskClick: (id: string) => void;
  onRefresh: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled });
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/columns/${column.id}/tasks`, json("POST", { title }));
      setTitle("");
      setAdding(false);
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div
      className={`kanban-column ${isOver ? "drop-over" : ""}`}
      ref={setNodeRef}
    >
      <div className="column-header">
        <div>
          <span className="column-accent" />
          <h2>{column.name}</h2>
          <span className="column-count">{column.tasks.length}</span>
        </div>
        <button
          className="icon-button"
          title="Add task"
          onClick={() => setAdding(true)}
        >
          <Plus size={18} />
        </button>
      </div>
      <SortableContext
        items={column.tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="column-tasks">
          {column.tasks.length ? (
            column.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                disabled={disabled}
                onClick={() => onTaskClick(task.id)}
              />
            ))
          ) : (
            <div className="column-empty">
              Drop a task here or add one below.
            </div>
          )}
        </div>
      </SortableContext>
      {adding ? (
        <form className="quick-add" onSubmit={add}>
          <textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            placeholder="What needs to get done?"
            rows={2}
          />
          <div>
            <button className="button primary compact" type="submit">
              Add task
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setAdding(false)}
            >
              <X size={17} />
            </button>
          </div>
        </form>
      ) : (
        <button className="add-task-button" onClick={() => setAdding(true)}>
          <Plus size={17} /> Add task
        </button>
      )}
    </div>
  );
}
function TaskCard({
  task,
  disabled,
  onClick,
}: {
  task: Task;
  disabled: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`task-card ${isDragging ? "dragging" : ""}`}
    >
      <div className="task-card-top">
        <span className={`priority-dot ${task.priority.toLowerCase()}`} />
        <span className={`priority-label ${task.priority.toLowerCase()}`}>
          {task.priority.toLowerCase()}
        </span>
        <button
          className="drag-handle"
          aria-label={`Drag ${task.title}`}
          {...attributes}
          {...listeners}
          disabled={disabled}
        >
          <GripVertical size={16} />
        </button>
      </div>
      <button className="task-title" onClick={onClick}>
        {task.title}
      </button>
      <div className="task-card-bottom">
        <div>
          {task.dueDate && (
            <span>
              <CalendarDays size={14} />{" "}
              {new Date(task.dueDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          {task._count.comments > 0 && (
            <span>
              <MessageCircle size={14} /> {task._count.comments}
            </span>
          )}
        </div>
        <div className="card-avatars">
          {task.assignees.slice(0, 2).map((a) => (
            <span className="avatar tiny" title={a.user.name} key={a.user.id}>
              {a.user.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
type TaskDetail = Task & {
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string };
  }>;
};
function TaskPanel({
  taskId,
  board,
  onClose,
  onRefresh,
}: {
  taskId: string;
  board: Board;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    api<{ task: TaskDetail }>(`/api/tasks/${taskId}`)
      .then(({ task }) => {
        setTask(task);
        setTitle(task.title);
        setDescription(task.description);
        setPriority(task.priority);
        setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : "");
        setAssignees(task.assignees.map((a) => a.user.id));
      })
      .catch((e) => toast.error(e.message));
  }, [taskId]);
  useEffect(() => {
    load();
  }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(
        `/api/tasks/${taskId}`,
        json("PATCH", {
          title,
          description,
          priority,
          dueDate: dueDate
            ? new Date(`${dueDate}T12:00:00`).toISOString()
            : null,
          assigneeIds: assignees,
        }),
      );
      toast.success("Task updated.");
      onRefresh();
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(
        `/api/tasks/${taskId}/comments`,
        json("POST", { body: comment }),
      );
      setComment("");
      load();
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function remove() {
    if (!confirm("Delete this task and its comments?")) return;
    try {
      await api(`/api/tasks/${taskId}`, { method: "DELETE" });
      onClose();
      onRefresh();
      toast.success("Task deleted.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="task-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
      >
        <div className="panel-top">
          <span className="section-kicker">TASK DETAILS</span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close task"
          >
            <X size={20} />
          </button>
        </div>
        {!task ? (
          <p>Loading task…</p>
        ) : (
          <>
            <form onSubmit={save}>
              <label>
                Task title
                <input
                  className="panel-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  required
                />
              </label>
              <div className="panel-column-name">
                In {board.columns.find((c) => c.id === task.columnId)?.name}
              </div>
              <div className="panel-fields">
                <label>
                  Priority
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
              </div>
              <label>
                Description
                <textarea
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add the details your team needs…"
                />
              </label>
              <div className="assignee-field">
                <strong>Assignees</strong>
                <div>
                  {board.workspace.members.map((m) => (
                    <label key={m.user.id} className="assignee-option">
                      <input
                        type="checkbox"
                        checked={assignees.includes(m.user.id)}
                        onChange={(e) =>
                          setAssignees(
                            e.target.checked
                              ? [...assignees, m.user.id]
                              : assignees.filter((id) => id !== m.user.id),
                          )
                        }
                      />
                      <span className="avatar tiny">
                        {m.user.name.slice(0, 1).toUpperCase()}
                      </span>
                      {m.user.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="panel-actions">
                <button className="button primary" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={remove}
                >
                  Delete task
                </button>
              </div>
            </form>
            <section className="comments-section">
              <h3>
                Comments <span>{task.comments.length}</span>
              </h3>
              {task.comments.map((c) => (
                <div className="comment" key={c.id}>
                  <span className="avatar small">
                    {c.author.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <div>
                      <strong>{c.author.name}</strong>
                      <time>{new Date(c.createdAt).toLocaleString()}</time>
                    </div>
                    <p>{c.body}</p>
                  </div>
                </div>
              ))}
              <form onSubmit={addComment}>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  required
                  maxLength={5000}
                  rows={3}
                  placeholder="Add a comment…"
                />
                <button className="button secondary compact" type="submit">
                  Post comment
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
