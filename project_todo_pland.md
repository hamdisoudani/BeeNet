## Beenet MVP Integration Plan (Clerk + Nest proxy + Python Agent + Mongo)

### Ground rules
- [x] Ports: Frontend `3000`, Nest `4000`, Python agent `8000`
- [x] CORS: Allow `http://localhost:3000` with credentials on Nest
- [x] Auth: All Nest routes are Clerk-guarded
- [x] Thread = Conversation: one stable `threadId` per chat
- [x] Turn = 3-message group: user, agent_state, assistant share `turnId`

### Environment
- [x] Frontend `.env.local`
  - `NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL=http://localhost:4000/copilotkit`
  - `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...`
  - `CLERK_SECRET_KEY=...`
- [x] Backend `.env`
  - `PORT=4000`
  - `FRONTEND_ORIGIN=http://localhost:3000`
  - `CLERK_SECRET_KEY=...`
  - `CLERK_PUBLISHABLE_KEY=...`
  - `MONGODB_URI=mongodb://127.0.0.1:27017/beenet`
  - `AGENT_URL=http://localhost:8000/copilotkit`

### Backend (NestJS) — Core
- [x] Update `src/main.ts`
  - [x] `app.enableCors({ origin: [process.env.FRONTEND_ORIGIN], credentials: true })`
  - [x] `app.setGlobalPrefix('api')`
  - [x] `listen(PORT || 4000)`
  - Notes: Added `helmet`, `compression`, and a global `ValidationPipe` (whitelist/forbid/transform). Buffer logs enabled.
- [x] Auth guard: `ClerkAuthGuard` (uses `@clerk/backend`)
  - Notes: Accepts Bearer token or `__session` cookie; attaches `req.auth.userId`.
- [x] Mongo connection: `MongooseModule.forRoot(MONGODB_URI)`
  - Notes: Single connection, default DB `beenet`.
- [x] Schemas
  - [x] `user_secrets`: { userId[unique], openaiApiKey, openaiBaseUrl, openaiModel, tavilyApiKey } + timestamps
  - [x] `conversations`: { userId, threadId[unique per user], title, status, lastMessageAt, messageCount } + timestamps
  - [x] `messages`: { userId, conversationId, threadId, turnId, role: user|assistant|agent_state, content, agentName?, raw } + timestamps
  - [x] Indexes: `user_secrets.userId unique`, `conversations {userId,threadId} unique`, `messages {conversationId,createdAt}`, `{conversationId,turnId}`
- [x] Modules/controllers
  - [x] `SecretsModule` (`GET/PUT /api/secrets`, `PUT /api/secrets/default`)
  - [x] `MessagesModule`
    - [x] `POST /api/conversations/init` {threadId? → generated if missing, title?} → upsert conversation, return `{conversationId, threadId, title}`
    - [x] `POST /api/messages/turn` {threadId,turnId,user,agentState,assistant}
    - [x] `DELETE /api/messages/turn` {threadId,turnId}
    - [x] `GET /api/conversations` and `GET /api/messages?threadId=`
  - [x] `ProxyModule`
  - [x] `@All('copilotkit*')` transparent proxy to `AGENT_URL` (Clerk-guarded)
  - [x] Verbose request/response logging for debugging (method, URL, headers, body size, preview)
  - [x] Streaming restored for `/agents/state|execute` (pipes upstream body, strips `content-length`, sets `Cache-Control: no-cache`, `Connection: keep-alive`, `Content-Type: text/event-stream`, flushes headers)
  - [x] Compression bypass for SSE endpoints to avoid buffering
  - [x] Auth header propagation: frontend runtime forwards Clerk headers; guard accepts Bearer, `__session`, `x-clerk-auth-token`
- [ ] Rate limiting/timeouts (basic) and request logging middleware (optional)
  - Notes: To be added post-MVP. Consider per-user rate limit.

### Python Agent — Core
- [ ] FastAPI middleware reads headers from Nest
  - [ ] `x-openai-api-key`, `x-openai-base-url`, `x-openai-model`, `x-tavily-api-key`
  - [ ] Temporarily override env vars during request
  - [ ] Extract `x-thread-id` to build `RunnableConfig` with `configurable.thread_id`
- [ ] (MVP+) Replace `MemorySaver` with persistent checkpointer later
  - [ ] e.g., `SqliteSaver('sqlite:///beenet_agent.db')`

### Frontend — Core
- [x] Point CopilotKit to Nest: `runtimeUrl = NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL`
- [x] Clerk setup (SSR + client): protect the chat page
- [x] Start Panel → secure init
  - [x] `POST /api/conversations/init` via Next API route proxy; backend generates `threadId` and returns `{conversationId, threadId, title}`
  - [x] Route to `/c/{threadId}?q=...`; `app/c/[id]/layout.tsx` scopes CopilotKit to chat; `page.tsx` sets threadId and auto-sends `q`
- [x] Thread lifecycle
  - [ ] Set CopilotKit thread via hook on `/c/{id}`; optional hydrate messages from `/api/messages?threadId=`
  - [ ] Clear local UI messages on thread change (optional)
- [ ] Turn persistence (server-side)
  - [ ] Option A now: persist in proxy at stream end (implemented); or Option B: client POST `/api/messages/turn` after completion
- [ ] Deletion UX
  - [ ] Delete a turn by calling `DELETE /api/messages/turn {threadId, turnId}` and update UI
- [ ] Secrets UI (simple form)
  - [x] `GET/PUT /api/secrets` to manage per-user models and Tavily
  - [x] `PUT /api/secrets/default` to persist the default model

Notes:
- CopilotKit already sends `threadId` in `/copilotkit/agents/state` and `/copilotkit/agents/execute` bodies.
- Next API endpoint `app/api/copilotkit/route.ts` forwards Clerk headers to backend using `onBeforeRequest` so the proxy can authenticate.
- Hook reference: `useCopilotContext()` → `{ threadId, setThreadId }`.

### Optional (Phase 2)
- [ ] `agent_runs` collection: store plan JSON per turn for audit
- [ ] `request_logs` collection with TTL for observability
- [ ] Soft delete for messages/conversations
- [ ] Idempotency header `x-idempotency-key` for retries
- [ ] Rate limiting per userId
- [ ] Docker Compose for Mongo + all services

### QA checklist
- [x] Auth required on every Nest route (including `/copilotkit*`)
- [x] Proxy streams SSE/Fetch responses without buffering
- [x] Default model selection persists server-side and is reflected in UI
- [ ] Conversation continuity across reloads (threadId)
- [ ] Deleting a turn removes all three messages in DB and UI
- [ ] Per-user keys applied (model reflects overrides)
- [ ] Basic load test: concurrent turns do not cross-contaminate state

### Frontend — Completed UI/Auth work (08-15-2025)
- [x] Auth & middleware
  - [x] Wrapped app in `ClerkProvider`; added `ThemeProvider` (system default) and `CopilotKit` in `app/providers.tsx`.
  - [x] Middleware switched to `clerkMiddleware` with `createRouteMatcher` (public: `/`, `/sign-in(.*)`, `/sign-up(.*)`); `/api/**` guarded.
  - [x] Sign-in/up routes under `app/(auth)/sign-in` and `app/(auth)/sign-up`.
- [x] Landing + gated chat
  - [x] `SignedOut` → minimal landing page with CTAs.
  - [x] `SignedIn` → sidebar + chat layout.
- [x] Sidebar polish
  - [x] Removed duplicate sidebar trigger from the sidebar header; single toggle in top navbar.
  - [x] Fixed horizontal scroll by updating `SidebarSeparator` and `SidebarContent` (`overflow-x-hidden`).
- [x] Theme toggle
  - [x] Added top-right theme toggle using `next-themes`; default follows system.
- [x] Chat shell refresh (`components/chat/CustomChat.tsx`)
  - [x] Chat content in rounded card, proper height with sidebar navbar.
  - [x] Messages area flexible; composer anchored bottom.
  - [x] Composer redesign: unified surface, transparent textarea, focus ring; light-mode border contrast; minimal blur/shadow.
  - [x] Send action embedded inside the textarea container (fixed bottom-right); compact icon; spinner while running.
  - [x] Keyboard: Enter to send; Shift+Enter new line.
  - [x] Removed dark gradients and stacked layers; consistent light/dark.

#### Frontend — Recent UX + infra polish (08-16-2025)
- [x] Integrated, Perplexity‑style query input on landing (`app/page.tsx`)
  - [x] Single cohesive surface (no gray offsets), foreground/opacity scale, backdrop blur
  - [x] Responsive typography and spacing; Pro/Attach affordances reserved for future features
  - [x] Suggestions row (pills) with consistent visual language
- [x] Matching integrated composer in chat (`components/chat/CustomChat.tsx` → `Input`)
  - [x] Pure `<textarea>` with content sizing, hidden scrollbars, high-contrast send button
  - [x] Clear focus/disabled states; ⌘+Enter hint; loading state with spinner
  - [x] Tight layout: removed excess outer paddings/margins; composer constrained to chat width
- [x] CopilotKit host element constraints
  - [x] Global overrides in `app/globals.css` to remove default padding/margins/max-width on `.copilotKitChat`
  - [x] Component SCOPED overrides on `CopilotChat` `className` to enforce `!p-0 !mx-0 !max-w-none`
  - [x] Prevent oversized input container; align to the chat card edges
- [x] Sidebar experience
  - [x] Desktop: when collapsed, show floating “BeeNet + toggle” overlay (framer-motion)
  - [x] Mobile: restored top navbar inside `SidebarInset` with trigger + brand (left) and profile + theme (right)
  - [x] Conversations section uses `ScrollArea` (≈50vh) and inline “Conversations + +” header
- [x] Reliable first‑turn handoff
  - [x] Replaced URL `?q=` handoff with in‑memory Zustand store (`stores/pendingTurn.ts`)
  - [x] `app/page.tsx`: queue `{id,content}` then navigate to `/c/{threadId}` (no query)
  - [x] `app/c/[id]/page.tsx`: after verification, consume queued turn (or fallback to legacy `?q`) and send exactly once

##### Implementation notes / gotchas
- CopilotKit DOM class names may change across versions; our `.copilotKitChat` CSS and `className` selectors should be revisited during upgrades.
- The composer uses native `<textarea>` with `fieldSizing: content` which is supported in modern browsers. If older browsers are targeted, consider a JS auto-resize fallback.
- Zustand queue is intentionally in‑memory to avoid persisting user input; this means tab reload before chat mount will drop the queued message (acceptable tradeoff).
- Our CSS overrides use `!important` where necessary to defeat built‑in styles; keep this localized to CopilotKit host selectors.

#### Branding & Navigation polish (08-18-2025)
- Replaced textual brand with a logo image across the app using Next.js `Image` with an import, not a path:
  - `public/logo.png` imported as `import Logo from '@/public/logo.png'`.
  - Sidebar header shows only the logo (linked to `/`).
  - Collapsed desktop overlay chip also uses the logo.
  - Landing page (`app/page.tsx`) header replaces the BeeNet text with the logo.
- Back navigation:
  - Removed desktop floating back button from the chat page; content no longer shifts on scroll.
  - Mobile navbar shows a back arrow only on chat routes (`/c/...`).
- Sidebar header layout tightened into a single non-wrapping row: brand/logo on the left, collapse trigger on the right. Optional Back link appears next to the brand only on chat pages when needed.
- Sizing guidance (current): sidebar header ~32–64px, collapsed chip ~24px, landing header ~84px. Adjust with `width/height` on `Image` as needed.
- Notes:
  - Always prefer `Image` with imported static asset for optimization and type-safety.
  - Keep the logo clickable to `/` to serve as the “home” affordance on desktop.

#### Chat loader — Animated bee (08-18-2025)
- Replaced the generic spinner in `components/chat/CustomChat.tsx` with an animated Bee loader (`BeeLoader`).
  - Uses the same logo via `Image` and a lightweight `@keyframes` buzz animation.
  - Shows alongside the "Thinking…" label; contained in a small rounded badge.
- Implementation note: animation is component-scoped via `style jsx` to avoid global CSS churn. Move to global CSS if we want to reuse across components.
### Notes / To remember
- Thread lifecycle polishing: hydrate messages on `/c/{id}`; clear local messages on thread change.
- Persistence: proxy currently persists at stream end; client-side fallback `/api/messages/turn` optional.
- Clerk/Nest auth: proxy guard now accepts Bearer, `__session`, and `x-clerk-auth-token` and validates `azp` against `FRONTEND_ORIGIN`.
- Optional quick actions for composer (attach, mic) can be added alongside the send icon if needed.
 - Future polish: add theme-aware code theme switch (oneDark/oneLight), optional line numbers, and collapsible long code blocks (already prototyped in markdown renderer).
 - Consider a sticky mobile navbar for chat (`position: sticky; top: 0;`) if we introduce additional top actions.

### Session recap (08-15-2025)
- Implemented Clerk across the frontend (provider + middleware + auth routes) and a gated landing/chat experience.
- Added a theme toggle and tuned UI for light/dark parity.
- Overhauled chat UI: improved container, messages area, and a modern composer with inline send icon and running spinner.

### Session recap (08-14-2025)
- Implemented Nest proxy for CopilotKit: path fix, header passthrough, robust body forwarding, detailed logs
- Verified end-to-end requests: `/copilotkit/info`, `/agents/state`, `/agents/execute` → 200 from Python agent
- Temporarily disabled proxy auth to validate flow; will re-enable with Clerk cookie/Bearer once stable
- Frontend now targets Nest runtime URL; confirmed threadId present in request bodies

### Next actions (carry into next chat)
- Frontend: add "New chat" button → generate UUID, `setThreadId(newId)`, clear local messages
- Re-enable Clerk guard on proxy and ensure CORS credentials; forward cookies
- Optionally add `x-thread-id` header from body.threadId (not required for MVP)
- Reduce proxy logs; restore streaming passthrough for execute/state
- Begin persistence: conversations/messages using `threadId` + `turnId`

### Engineering rules (prod-ready minimums)
- [ ] Input validation with DTOs + `class-validator`/`class-transformer` on all controllers
- [ ] Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`
- [ ] Security middleware enabled: `helmet`, `compression`, CORS with credentials
- [ ] Error handling: wrap DB and network calls in try/catch; return `{ ok: false, error? }` without leaking secrets
- [ ] Principle of least logging: never log secrets/headers with keys, redact sensitive fields
- [ ] Auth everywhere: Clerk guard on all `/api/*` and `/copilotkit*`
- [ ] Streaming-safe proxy: do not buffer responses, preserve headers/method/path/query
- [ ] Indexes created for query paths (see schema files)
- [ ] Idempotency-ready: accept `x-idempotency-key` (future), avoid duplicate inserts by unique keys where applicable
- [ ] Notes: document any deviations or operational caveats under each step


### Definition of Done (MVP)
- [ ] Login with Clerk gates the chat
- [ ] Frontend chats through Nest proxy to the Python agent
- [ ] Per-user model/Tavily keys configurable and applied per request
- [ ] Conversations and messages persisted in MongoDB using `threadId` + `turnId`
- [ ] Turn deletion cascades correctly
- [ ] README notes for running all three services


### Model Management Overhaul (08-18-2025)

#### Backend
- Switched per-user model entries to Mongo subdocuments with auto-generated `_id`.
  - Responses map subdoc `_id` → `id` for the frontend.
- `SecretsService.upsertForUser`
  - Merges existing models with incoming ones; no client-generated ids.
  - Derives `provider` from `baseUrl` hostname.
  - Robust validation via a minimal chat completion request to `{baseUrl}/chat/completions`.
  - Creates canonical name `provider:model`.
  - Returns safe `models` (no apiKey) and `defaultModelId`.
  - Supports `setDefaultForNew` to set the newly created model as default.
- New secure endpoint `PUT /api/secrets/default`
  - Validates: document exists for user, model subdoc exists and belongs to user, and prevents no-op if already default.
  - Persists `defaultModelId` and returns `{ ok: true, defaultModelId }`.
- `resolveModelForUser` updated to accept either legacy `id` or subdoc `_id`.

#### Frontend
- API proxy route added: `app/api/secrets/default/route.ts` → forwards to Nest `PUT /api/secrets/default`.
- Settings page (`app/settings/page.tsx`)
  - Removed client-side id generation; rely on server-generated ids.
  - On save: sends `{ models: [{ baseUrl, apiKey, model }], setDefaultForNew }` and consumes returned `defaultModelId`.
  - The “Use” button now persists default via backend (`PUT /api/secrets/default`), shows “Setting…”, then re-fetches `GET /api/secrets` to hydrate from server truth.
  - Displays a “Default” pill; disables the button when default.
  - Loading UX: list skeleton while fetching; “Add model” dialog trigger disabled until data is loaded.
  - Mobile responsiveness: list items stack on small screens, enable word wrapping for long names/URLs.

#### Security/consistency invariants
- Never return or log `apiKey` to the client.
- Treat backend as the single source of truth for models and default selection.
- Always map Mongo subdoc `_id` to string `id` in responses.
- Provider is derived from `baseUrl` hostname; do not trust client-sent provider.

#### Open follow-ups
- Encrypt `apiKey` at rest (KMS-backed or field-level encryption).
- Add model rename/delete endpoints and UI.
- Add rate limiting to secrets endpoints and timeouts for provider validation.
- Backend tests for `secrets.service` (validation path, already-default, model-not-found).
- Surface backend error codes consistently in the UI (extend `mapBackendError`).



### Security and Platform Hardening (08-18-2025)

- Proxy → Agent authentication
  - Added HMAC signing on proxy requests with headers `x-proxy-signature`, `x-sent-at`, `x-nonce` (body hash included). Agent middleware verifies and rejects unauthorized.
  - No secrets are logged; only boolean flags and provider hostnames.
- Encryption at rest
  - Implemented AES-256-GCM envelope encryption for model provider keys and Tavily key.
  - Mongo fields: model subdocs now store `apiKeyEnc` (legacy `apiKey` unset on write); Tavily stored as `tavilyApiKeyEnc` (legacy `tavilyApiKey` unset on write).
  - Decrypt only server-side for proxy injection; never returned to client.
  - New required env: `DATA_KEY` (32-byte base64). Keep secret; plan rotation window later.
- Caching
  - Added 60s cache for secrets reads (`getForUser`, `resolveModelForUser`). Cache invalidated on any secrets write (model upsert/default, Tavily save/remove).
- Rate limiting
  - Global throttle enabled. Per-route limits:
    - `POST /api/conversations/init`: 10/min
    - `GET /api/secrets` and `GET /api/secrets/model`: 30/min
    - `PUT /api/secrets`, `PUT /api/secrets/tavily`, `POST /api/secrets/tavily/remove`: 5/min
    - `POST /api/secrets/model/test`, `PUT /api/secrets/default`, `POST /api/secrets/tavily/test`: 10/min
- Misc security
  - Helmet, CORS with credentials already enabled; SSE compression disabled to avoid buffering.


### Tavily Key Management (08-18-2025)

- Backend
  - `PUT /api/secrets/tavily`: validates via Tavily `/usage`, then persists encrypted key on success.
  - `POST /api/secrets/tavily/test`: validation-only helper.
  - `POST /api/secrets/tavily/remove`: deletes key.
  - `GET /api/secrets`: returns `hasTavilyKey` alongside models.
- Frontend
  - Settings page section for Tavily with Save (validate+persist) and Remove. Inputs disable autocomplete/correct/spellcheck.
  - UI no longer exposes a standalone Test button; Save performs validation.
- Proxy
  - Forwards `x-tavily-api-key` when present (from server-side secrets only).


### Proxy/Agent Runtime (08-18-2025)

- Agent FastAPI middleware
  - Verifies proxy HMAC; extracts `x-openai-*` and `x-tavily-api-key` into per-request context (contextvars).
- Model factory reads per-request overrides
  - `brain/model.py` builds model from context > headers > env.
- Thread id
  - Removed custom thread propagation; CopilotKit owns thread scoping.


### Agent Error Handling & Plan Streaming (08-18-2025)

- Standardized, typed error surface in `AgentState.error` (and mirrored into `plan.error` where helpful).
- Planner node
  - Catches model failures/missing toolcall/parse errors; sets `error` with typed code; emits state; ends graph.
- Research node
  - First-iteration guard: on initial Tavily failure, sets `error` with code and returns early to avoid loops.
  - On completion, attaches `step.error` and `state.error` summary if any queries failed.
- Chat node
  - Catches model failures/timeouts; sets `state.error` and `plan.error`; emits; ends graph.
- Frontend
  - `useCoAgentStateRender`: if `state.error` or `plan.error` exists, render an inline error banner; otherwise render plan as before.
  - Resets `plan` and `error` before sending a new message and on initial state.


### Frontend UX & Infra (08-18-2025)

- Disabled autocomplete/autocorrect/spellcheck on credential inputs.
- Error banner implemented in chat to display agent-reported errors inline with plan.


### Ops / Required Environment

- `DATA_KEY` (32-byte base64) for AES-256-GCM encryption of provider/Tavily keys.
- `PROXY_SHARED_SECRET` for proxy→agent HMAC.
- Existing variables unchanged (Mongo, Clerk, runtime URLs).


### Follow-ups (post-MVP)

- Request/trace id propagation proxy→agent for observability.
- Agent network hardening (non-public or IP allowlist); consider mTLS.
- Key rotation/migration tooling and tests for `secrets.service` (encrypt path, default handling).
- Unit tests for error flows in planner/research/chat nodes.