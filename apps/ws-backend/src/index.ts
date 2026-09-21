import { Client } from "pg";
import { WebSocket, WebSocketServer } from "ws";
import { db } from "@taskflow/db";
import { boardAccess, env, verifyToken } from "@taskflow/backend-common";

type Session = { userId: string | null; rooms: Set<string> };
const sessions = new Map<WebSocket, Session>();
const allowedOrigin = new URL(env.FRONTEND_URL).origin;
const wss = new WebSocketServer({ port: env.WS_PORT, maxPayload: 4096, verifyClient: (info: { origin: string }) => info.origin === allowedOrigin });
const send = (socket: WebSocket, value: unknown) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };

wss.on("connection", socket => {
  sessions.set(socket, { userId: null, rooms: new Set() });
  socket.on("message", async raw => {
    try {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      const session = sessions.get(socket);
      if (!session || typeof message.type !== "string") return socket.close(1008, "Invalid message");
      if (message.type === "AUTH") {
        if (session.userId || typeof message.token !== "string") return socket.close(1008, "Invalid authentication");
        const userId = verifyToken(message.token);
        if (!userId || !await db.user.findUnique({ where: { id: userId }, select: { id: true } })) return socket.close(1008, "Unauthorized");
        session.userId = userId;
        send(socket, { type: "AUTH_OK" });
        return;
      }
      if (!session.userId) return socket.close(1008, "Authenticate first");
      if (message.type === "JOIN_BOARD") {
        if (typeof message.boardId !== "string") return send(socket, { type: "ERROR", message: "Invalid board ID." });
        const board = await boardAccess(message.boardId, session.userId);
        if (!board) return send(socket, { type: "ERROR", message: "You do not have access to this board." });
        session.rooms.add(board.id);
        send(socket, { type: "JOINED_BOARD", boardId: board.id });
      } else if (message.type === "LEAVE_BOARD" && typeof message.boardId === "string") {
        session.rooms.delete(message.boardId);
      } else {
        send(socket, { type: "ERROR", message: "Unknown message type." });
      }
    } catch { send(socket, { type: "ERROR", message: "Invalid message." }); }
  });
  socket.on("close", () => sessions.delete(socket));
});

async function listenForEvents() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  await client.query("LISTEN taskflow_events");
  client.on("notification", async notification => {
    try {
      const event = JSON.parse(notification.payload ?? "") as { boardId?: string; type?: string };
      if (!event.boardId || !event.type) return;
      for (const [socket, session] of sessions) {
        if (!session.userId || !session.rooms.has(event.boardId)) continue;
        if (!await boardAccess(event.boardId, session.userId)) {
          session.rooms.delete(event.boardId);
          send(socket, { type: "ACCESS_REVOKED", boardId: event.boardId });
          continue;
        }
        send(socket, { type: event.type, boardId: event.boardId });
      }
    } catch (error) { console.error("Failed to process board event", error); }
  });
  client.on("error", error => { console.error("PostgreSQL listener failed", error); process.exit(1); });
  console.log(`TaskFlow WebSocket listening on ${env.WS_PORT}`);
}
listenForEvents().catch(error => { console.error(error); process.exit(1); });
