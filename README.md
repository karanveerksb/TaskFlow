# TaskFlow

TaskFlow is a collaborative project management platform for workspaces, Kanban boards, tasks, assignments, comments, and live board updates. It is an independent project built with a pnpm/Turborepo monorepo.

## Features

- Email/password signup and login with bcrypt password hashing and signed JWTs
- Multiple workspaces per user, with `OWNER` and `MEMBER` roles
- Email-bound, expiring, single-use workspace invitation links
- Boards with default columns and configurable additional columns
- Tasks with priority, due date, multiple assignees, comments, and persistent drag ordering
- Board search and filters for title, priority, assignee, and column
- Structured activity history and live board refresh through WebSockets
- Object-level authorization on every workspace, board, column, task, and room join

## Architecture

```text
apps/taskflow-web       Next.js interface
apps/http-backend       Express REST API and all database writes
apps/ws-backend         Authenticated WebSocket board rooms
packages/db             Prisma schema and client
packages/common         Shared validation schemas
packages/backend-common Shared environment and JWT/board access logic
```

PostgreSQL is the source of truth. A board mutation runs in a Prisma transaction, records an activity entry where useful, and sends a PostgreSQL `NOTIFY` in the same transaction. The WebSocket service `LISTEN`s for committed notifications and broadcasts a small event to authorized board subscribers. Clients fetch the latest board state after an event. This works across separate HTTP and WebSocket processes and across multiple WebSocket instances connected to the same PostgreSQL database. PostgreSQL notifications are transient; a reconnecting client always reloads the board from the API.

The browser sends its JWT as the first WebSocket message, then requests a board join. The service verifies the token and queries current workspace membership before joining. It checks membership again when broadcasting, so removed members stop receiving board events. It never creates membership from a board ID.

## Stack

Node.js 22+, pnpm, Turborepo, Next.js 15, React 19, TypeScript, Tailwind CSS, Express, `ws`, PostgreSQL 16, Prisma 6, Zod, and dnd-kit.

## Local setup

1. Install Node.js 22+, pnpm, and Docker Desktop. On a Homebrew setup with `node@22` installed but another `node` linked globally, put `/opt/homebrew/opt/node@22/bin` first on `PATH`.
2. Run `pnpm install` from the repository root.
3. Copy `.env.example` to `.env` and replace `JWT_SECRET` with a random value of at least 32 characters. The example uses `localhost:5433` to avoid conflicting with another PostgreSQL instance.
4. Run `docker compose up -d postgres`.
5. Run `pnpm db:generate` and `pnpm db:deploy` (or `pnpm db:migrate` while creating a new migration).
6. Run `pnpm dev` and open [http://localhost:3000](http://localhost:3000).

The root `pnpm dev` command starts the Next.js frontend on 3000, the API on 3001, and WebSocket service on 8080. It builds the shared packages first. API health checks are `GET /health` and `GET /ready`; readiness queries PostgreSQL.

## Environment variables

| Variable              | Used by                | Purpose                                               |
| --------------------- | ---------------------- | ----------------------------------------------------- |
| `DATABASE_URL`        | API, WebSocket, Prisma | PostgreSQL connection string                          |
| `JWT_SECRET`          | API, WebSocket         | Shared signing secret, at least 32 characters         |
| `FRONTEND_URL`        | API, WebSocket         | Allowed browser origin                                |
| `HTTP_PORT`           | API                    | Local API port; falls back to `PORT`, then 3001       |
| `WS_PORT`             | WebSocket              | Local WebSocket port; falls back to `PORT`, then 8080 |
| `NEXT_PUBLIC_API_URL` | frontend               | Browser-facing API origin                             |
| `NEXT_PUBLIC_WS_URL`  | frontend               | Browser-facing `ws://` or `wss://` URL                |

The frontend has no database credentials or signing secret. For this MVP it keeps the access token in `sessionStorage`, which limits persistence to a tab but does not protect against an injected script. A future authentication hardening pass can move browser sessions to secure, HttpOnly cookies with CSRF protection and a deployment-specific cross-site cookie policy.

## Authorization and data model

`WorkspaceMember` is the authoritative membership relation. Owners can update a workspace, create and delete boards, invite and remove members, and manage tasks. Members can read boards and create, update, move, and comment on tasks. Each resource lookup resolves its owning board and workspace before returning or changing data. Assignees must be current workspace members. Removing a member clears their task assignments and revokes their board subscriptions.

Board names are unique **within a workspace**, so two workspaces can both have a board named “Website.” Tasks and columns use stable UUIDs; task `position` values are stored in PostgreSQL and rewritten in a serializable transaction when a task moves or reorders. The task's composite foreign key ensures its column belongs to its board. Related board data cascades when a board is deleted.

Invitation links contain a cryptographically random token. Only its SHA-256 hash is stored. The token expires after seven days, is tied to the invited email, and is claimed once in a transaction before membership is created. TaskFlow returns the link to the owner to share; it does not send email or require an email provider.

The `OAuthAccount` table allows Google or GitHub login to be added later. OAuth is not active in this MVP and no provider keys are required for local development.

## API overview

| Group       | Endpoints                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Auth        | `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`                                                          |
| Workspaces  | `GET/POST /api/workspaces`, `GET/PATCH /api/workspaces/:id`, `DELETE /api/workspaces/:id/members/:userId`                    |
| Invitations | `POST /api/workspaces/:id/invites`, `POST /api/workspaces/invites/:token/accept`                                             |
| Boards      | `GET/POST /api/workspaces/:id/boards`, `GET/PATCH/DELETE /api/boards/:id`, `GET /api/boards/:id/activity`                    |
| Columns     | `POST /api/boards/:id/columns`, `PATCH/DELETE /api/columns/:id`                                                              |
| Tasks       | `POST /api/columns/:id/tasks`, `GET/PATCH/DELETE /api/tasks/:id`, `POST /api/tasks/:id/move`, `POST /api/tasks/:id/comments` |

Authenticated HTTP calls use `Authorization: Bearer <token>`. Input is validated with Zod. A move accepts a target column ID and zero-based target index; the backend validates board ownership and persists contiguous positions. The UI updates optimistically and reloads the board if the request fails.

## Tests and checks

Create an isolated test database, apply migrations to it, then run the integration suite:

```bash
docker compose exec -T postgres psql -U taskflow -d postgres -c 'CREATE DATABASE taskflow_test'
DATABASE_URL='postgresql://taskflow:taskflow@localhost:5433/taskflow_test?schema=public' pnpm db:deploy
DATABASE_URL='postgresql://taskflow:taskflow@localhost:5433/taskflow_test?schema=public' JWT_SECRET='a-local-test-secret-with-at-least-thirty-two-characters' FRONTEND_URL='http://localhost:3000' pnpm test
pnpm typecheck
pnpm build
```

The test suite refuses a `DATABASE_URL` whose database name does not end in `_test`. It covers cross-workspace board and task denial, WebSocket join denial, duplicate board names within a workspace, identical board names across workspaces, email-bound and single-use invitations, cross-column moves, same-column reorder, event delivery, and membership revocation. It cleans up the rows it creates.

## Deployment plan

- **Vercel:** deploy `apps/taskflow-web` from the monorepo and set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` to the public Railway service URLs. Use `wss://` for WebSockets in production.
- **Railway API:** install at the monorepo root, run `pnpm --filter @taskflow/http-backend... build`, then `pnpm --filter @taskflow/http-backend start`. Set `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and Railway's `PORT`. Run `pnpm db:deploy` as a release step before starting the new API version.
- **Railway WebSocket:** run `pnpm --filter @taskflow/ws-backend... build`, then `pnpm --filter @taskflow/ws-backend start`. Set the same database, JWT secret, frontend origin, and `PORT`.
- **Railway PostgreSQL:** provision a managed PostgreSQL instance and supply its connection URL to both services. Keep the API and WebSocket service on separate public domains. Set `FRONTEND_URL` to the exact Vercel origin.

TaskFlow has not been deployed. No production credentials belong in Git.

## Screenshots

Screenshots of the dashboard and board can be added here after deployment or a local demo capture.
