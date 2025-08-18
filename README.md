# Beenet – Agentic Chat Application

A production-ready agentic chat application with a Python backend and a modern Next.js UI.

- Robust agent flow (planner → research(loop via conditional) → chat)
- CopilotKit state streaming and generative UI
- Frontend chat shell with responsive layout and persisted message history
- Strong error handling and type-safe interfaces

## Architecture

- `agents/py-agent`
  - LangGraph graph: `planner_node` → `research_node` (conditional loop) → `chat_node` (ToolNode optional)
  - Lightweight planner model; main model for chat
  - CopilotKit config for streaming state with hidden tool calls
  - Emits structured JSON `plan` and appends per-turn history in `plans`
- `beenet-frontend`
  - Next.js App Router + CopilotKit UI
  - Headless chat hook for logging and persistence
  - Inline plan rendering via `useCoAgentStateRender` with live source cards
  - Rich markdown UI: tables, code with copy, math (KaTeX), headings/lists/HR spacing, and per-message separators

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.12+

### 1) Backend (Python LangGraph)

```bash
cd agents/py-agent
python main.py
# Server: http://localhost:8000
# CopilotKit endpoint: http://localhost:8000/copilotkit
```

For detailed backend setup and customization, see `agents/py-agent/README.md`.

### 2) Frontend (Next.js)

```bash
cd beenet-frontend
npm install
npm run dev
# App: http://localhost:3000
```

The Next.js app proxies to the Python agent via `/api/copilotkit`.

For detailed frontend setup and customization, see `beenet-frontend/README.md`.

## Environment Configuration

- Frontend (`beenet-frontend/app/layout.tsx`):
  - `publicLicenseKey` for CopilotKit
  - `runtimeUrl` set to `/api/copilotkit`
  - `agent` set to `starterAgent`

- Backend (`agents/py-agent/main.py`):
  - Exposes FastAPI endpoint `/copilotkit` via `add_fastapi_endpoint`
  - Agent name `starterAgent`

## Key Files

- Agent
  - `agents/py-agent/brain/graph.py`: Graph wiring and conditional edges
  - `agents/py-agent/nodes/planner.py`: Strict router; typed `set_research_plan` tool supports structured steps `{title, queries[]}`
  - `agents/py-agent/nodes/research.py`: Manual Tavily executor; streams results and quick findings
  - `agents/py-agent/nodes/basic_chat.py`: Tool-free synthesis; embeds plan context
  - `agents/py-agent/brain/state.py`: AgentState + plan history (plans)
  - `agents/py-agent/brain/model.py`: `get_model()` and `get_planner_model()`

- Frontend
  - `beenet-frontend/app/page.tsx`: Renders chat
  - `beenet-frontend/components/chat/CustomChat.tsx`: Chat shell, messages list, input, plan rendering, persistence
  - `beenet-frontend/app/api/copilotkit/route.ts`: CopilotKit runtime proxy

## Development Notes

- Plans are streamed as structured JSON; the UI normalizes and renders safely with incremental updates.
- Each user turn resets the current plan; planner streams a fresh one.
- Message keys are collision-resistant for multi-turn, multi-action scenarios.
- Planner uses a lightweight model for latency/cost; chat uses the main model.
 - Assistant messages include Copy/Regenerate actions (no secrets baked in; handlers are wired via runtime callbacks).

## Troubleshooting

- Agent not found: ensure frontend and backend agent names match (`starterAgent`).
- Fetch failed: verify the Python server is running on `http://localhost:8000` and that CORS allows `http://localhost:3000`.
- No plan rendering: confirm `planner_node` emits JSON via `model_dump()` and that `useCoAgentStateRender` is mounted.

## License

Provided as-is under the repository’s license. Review third-party licenses for CopilotKit, LangGraph, and model providers used.
