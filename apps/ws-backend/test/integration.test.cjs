const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");
const WebSocket = require("ws");

const url = new URL(
  process.env.DATABASE_URL || "postgresql://localhost/invalid",
);
if (!url.pathname.endsWith("_test"))
  throw new Error(
    "Integration tests require a dedicated *_test database in DATABASE_URL.",
  );
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error("JWT_SECRET must be set for integration tests.");
const { app } = require("../../http-backend/dist/index.js");
const { db } = require("@taskflow/db");

function message(socket, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeout);
    function onMessage(raw) {
      const value = JSON.parse(raw.toString());
      if (predicate(value)) {
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(value);
      }
    }
    socket.on("message", onMessage);
  });
}
function openSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket("ws://127.0.0.1:18080", {
      origin: "http://localhost:3000",
    });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}
async function join(socket, token, boardId) {
  const authed = message(socket, (m) => m.type === "AUTH_OK");
  socket.send(JSON.stringify({ type: "AUTH", token }));
  await authed;
  const result = message(
    socket,
    (m) => m.type === "JOINED_BOARD" || m.type === "ERROR",
  );
  socket.send(JSON.stringify({ type: "JOIN_BOARD", boardId }));
  return result;
}

test(
  "workspace authorization, invitations, ordering, and WebSocket board rooms",
  { timeout: 30000 },
  async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const wsProcess = spawn(
      process.execPath,
      [resolve(__dirname, "../dist/index.js")],
      {
        env: { ...process.env, WS_PORT: "18080" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let wsOutput = "";
    wsProcess.stdout.on("data", (data) => {
      wsOutput += data.toString();
    });
    wsProcess.stderr.on("data", (data) => {
      wsOutput += data.toString();
    });
    const sockets = [];
    const workspaceIds = [];
    const userIds = [];
    async function request(path, method = "GET", body, token) {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
      };
    }
    try {
      await new Promise((resolveReady, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error("WebSocket server did not start: " + wsOutput)),
          5000,
        );
        const check = () => {
          if (wsOutput.includes("TaskFlow WebSocket listening")) {
            clearTimeout(timer);
            resolveReady();
          } else if (wsProcess.exitCode !== null) {
            clearTimeout(timer);
            reject(new Error(wsOutput));
          } else setTimeout(check, 30);
        };
        check();
      });
      const suffix = Date.now().toString(36);
      const first = await request("/api/auth/signup", "POST", {
        name: "Alex",
        email: `alex-${suffix}@example.test`,
        password: "strong-password-1",
      });
      const second = await request("/api/auth/signup", "POST", {
        name: "Blair",
        email: `blair-${suffix}@example.test`,
        password: "strong-password-2",
      });
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      userIds.push(first.data.user.id, second.data.user.id);
      const a = first.data.token,
        b = second.data.token;
      const wa = await request(
        "/api/workspaces",
        "POST",
        { name: "Workspace A" },
        a,
      );
      const wb = await request(
        "/api/workspaces",
        "POST",
        { name: "Workspace B" },
        b,
      );
      assert.equal(wa.status, 201);
      assert.equal(wb.status, 201);
      workspaceIds.push(wa.data.workspace.id, wb.data.workspace.id);
      const renamedWorkspace = await request(
        `/api/workspaces/${wa.data.workspace.id}`,
        "PATCH",
        { name: "Engineering", description: "Release planning" },
        a,
      );
      assert.equal(renamedWorkspace.status, 200);
      assert.equal(renamedWorkspace.data.workspace.name, "Engineering");
      assert.equal(renamedWorkspace.data.workspace.description, "Release planning");
      const boardA = await request(
        `/api/workspaces/${wa.data.workspace.id}/boards`,
        "POST",
        { name: "Website" },
        a,
      );
      const boardB = await request(
        `/api/workspaces/${wb.data.workspace.id}/boards`,
        "POST",
        { name: "Website" },
        b,
      );
      assert.equal(boardA.status, 201);
      assert.equal(boardB.status, 201);
      const renamedBoard = await request(
        `/api/boards/${boardA.data.board.id}`,
        "PATCH",
        { name: "Launch board" },
        a,
      );
      assert.equal(renamedBoard.status, 200);
      assert.equal(renamedBoard.data.board.name, "Launch board");
      assert.equal(
        (
          await request(
            `/api/workspaces/${wa.data.workspace.id}/boards`,
            "POST",
            { name: "Launch board" },
            a,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            `/api/boards/${boardA.data.board.id}`,
            "GET",
            undefined,
            b,
          )
        ).status,
        403,
      );
      const board = (
        await request(
          `/api/boards/${boardA.data.board.id}`,
          "GET",
          undefined,
          a,
        )
      ).data.board;
      const todo = board.columns.find((c) => c.name === "To Do");
      const doing = board.columns.find((c) => c.name === "In Progress");
      const task = await request(
        `/api/columns/${todo.id}/tasks`,
        "POST",
        { title: "Build secure access" },
        a,
      );
      assert.equal(task.status, 201);
      assert.equal(
        (
          await request(
            `/api/tasks/${task.data.task.id}`,
            "PATCH",
            { title: "Unauthorized edit" },
            b,
          )
        ).status,
        403,
      );
      const unauthorizedSocket = await openSocket();
      sockets.push(unauthorizedSocket);
      const denied = await join(unauthorizedSocket, b, boardA.data.board.id);
      assert.equal(denied.type, "ERROR");
      const invite = await request(
        `/api/workspaces/${wa.data.workspace.id}/invites`,
        "POST",
        { email: second.data.user.email },
        a,
      );
      assert.equal(invite.status, 201);
      const wrongAccount = await request(
        `/api/workspaces/invites/${invite.data.token}/accept`,
        "POST",
        {},
        a,
      );
      assert.equal(wrongAccount.status, 403);
      assert.match(wrongAccount.data.message, /different email address/);
      assert.equal(
        (await request(`/api/workspaces/invites/${invite.data.token}/accept`, "POST", {})).status,
        401,
      );
      assert.equal(
        (
          await request(
            `/api/workspaces/invites/${invite.data.token}/accept`,
            "POST",
            {},
            b,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `/api/workspaces/invites/${invite.data.token}/accept`,
            "POST",
            {},
            b,
          )
        ).status,
        400,
      );
      const memberWorkspace = await request(
        `/api/workspaces/${wa.data.workspace.id}`,
        "GET",
        undefined,
        b,
      );
      assert.equal(memberWorkspace.status, 200);
      assert.deepEqual(
        memberWorkspace.data.workspace.members.map((member) => member.role).sort(),
        ["MEMBER", "OWNER"],
      );
      for (const [path, method, body] of [
        [`/api/workspaces/${wa.data.workspace.id}`, "PATCH", { name: "Unauthorized" }],
        [`/api/boards/${boardA.data.board.id}`, "PATCH", { name: "Unauthorized" }],
        [`/api/boards/${boardA.data.board.id}`, "DELETE", undefined],
        [`/api/workspaces/${wa.data.workspace.id}/members/${first.data.user.id}`, "DELETE", undefined],
      ]) {
        assert.equal((await request(path, method, body, b)).status, 403);
      }
      assert.equal(
        (await request(`/api/workspaces/${wa.data.workspace.id}/members/${first.data.user.id}`, "DELETE", undefined, a)).status,
        400,
      );
      const authorizedSocket = await openSocket();
      sockets.push(authorizedSocket);
      assert.equal(
        (await join(authorizedSocket, b, boardA.data.board.id)).type,
        "JOINED_BOARD",
      );
      const event = message(authorizedSocket, (m) => m.type === "TASK_MOVED");
      const moved = await request(
        `/api/tasks/${task.data.task.id}/move`,
        "POST",
        { targetColumnId: doing.id, targetIndex: 0 },
        a,
      );
      assert.equal(moved.status, 200);
      assert.equal((await event).boardId, boardA.data.board.id);
      const updated = (
        await request(
          `/api/boards/${boardA.data.board.id}`,
          "GET",
          undefined,
          b,
        )
      ).data.board;
      assert.equal(
        updated.columns.find((c) => c.id === doing.id).tasks[0].id,
        task.data.task.id,
      );
      assert.equal(
        updated.columns.find((c) => c.id === doing.id).tasks[0].position,
        0,
      );
      const secondTask = await request(
        `/api/columns/${doing.id}/tasks`,
        "POST",
        { title: "Second task" },
        b,
      );
      assert.equal(secondTask.status, 201);
      assert.equal(
        (
          await request(
            `/api/tasks/${secondTask.data.task.id}/move`,
            "POST",
            { targetColumnId: doing.id, targetIndex: 0 },
            b,
          )
        ).status,
        200,
      );
      const reordered = (
        await request(
          `/api/boards/${boardA.data.board.id}`,
          "GET",
          undefined,
          a,
        )
      ).data.board.columns.find((c) => c.id === doing.id).tasks;
      assert.deepEqual(
        reordered.map((t) => t.id),
        [secondTask.data.task.id, task.data.task.id],
      );
      assert.deepEqual(
        reordered.map((t) => t.position),
        [0, 1],
      );
      const revoked = message(
        authorizedSocket,
        (m) => m.type === "ACCESS_REVOKED",
      );
      assert.equal(
        (
          await request(
            `/api/workspaces/${wa.data.workspace.id}/members/${second.data.user.id}`,
            "DELETE",
            undefined,
            a,
          )
        ).status,
        204,
      );
      assert.equal((await revoked).boardId, boardA.data.board.id);
      assert.equal(
        (
          await request(
            `/api/boards/${boardA.data.board.id}`,
            "GET",
            undefined,
            b,
          )
        ).status,
        403,
      );
      const membersAfterRemoval = await request(
        `/api/workspaces/${wa.data.workspace.id}`,
        "GET",
        undefined,
        a,
      );
      assert.deepEqual(
        membersAfterRemoval.data.workspace.members.map((member) => member.user.id),
        [first.data.user.id],
      );
      assert.equal((await request(`/api/boards/${boardB.data.board.id}`, "DELETE", undefined, a)).status, 403);
      assert.equal((await request(`/api/boards/${boardB.data.board.id}`, "DELETE", undefined, b)).status, 204);
      assert.equal((await request(`/api/boards/${boardB.data.board.id}`, "GET", undefined, b)).status, 404);
    } finally {
      sockets.forEach((socket) => socket.close());
      wsProcess.kill();
      await new Promise((resolveClose) => server.close(resolveClose));
      if (workspaceIds.length)
        await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      if (userIds.length)
        await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.$disconnect();
    }
  },
);
