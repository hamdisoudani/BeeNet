## Beenet Frontend

A Next.js App Router UI tailored for the Beenet agent. It proxies to the backend CopilotKit endpoint and renders agent state inline as the backend streams updates.

### Run locally

```bash
npm install
npm run dev
# http://localhost:3000
```

### Configuration

- `app/layout.tsx` wraps the app with CopilotKit and sets:
  - `publicLicenseKey`: public key for headless chat hooks
  - `runtimeUrl`: `/api/copilotkit` (proxy to backend)
  - `agent`: `starterAgent`

### Key components

- `components/chat/CustomChat.tsx`
  - Uses headless chat hooks; persists messages to `localStorage`
  - Streams plan updates inline via `useCoAgentStateRender`
  - Displays each plan step with status, queries, and a grid of live source cards (favicon, title, domain)
  - Custom Assistant message with: copy + regenerate actions, separators between turns, and rich markdown rendering

### UI/Markdown rendering

This project uses `react-markdown` with a curated plugin set and shadcn/ui mappings for a professional look:

- remark: `remark-gfm`, `remark-breaks`, `remark-math`, `remark-smartypants`
- rehype: `rehype-raw` (paired with `rehype-sanitize`), `rehype-slug`, `rehype-external-links`, `rehype-highlight`, `rehype-katex`
- Component mappings: tables → shadcn `Table` components, inline/blocks of code with copy button, styled blockquotes, headings, lists, and horizontal rules

Math typesetting (KaTeX) CSS is required at runtime. Import it once in your app entry:

```ts
// app/layout.tsx (or a global styles entry)
import "katex/dist/katex.min.css";
```

> Note: No provider URLs, API keys, or model names are hardcoded here. Configure those via environment variables in your own deployment.

### API proxy

- `app/api/copilotkit/route.ts` bridges the UI to the Python agent endpoint.

### Notes

- Messages are persisted in `localStorage` under `beenet.chat.messages` for basic session restore.
- Plan rendering is resilient to partial updates; result cards stream in as queries complete.

### Dependencies added for markdown/UX

Install the following packages if you customize or recreate the setup:

```bash
npm i react-markdown remark-gfm remark-breaks remark-math remark-smartypants \
  rehype-raw rehype-sanitize rehype-slug rehype-external-links rehype-highlight rehype-katex katex
```
