# Beenet Frontend - Developer's Guide

This document provides a deep dive into the Beenet frontend for developers. For setup and installation instructions, please see the [main README](../../README.md).

## 🚀 Architecture & Tech Stack

The frontend is a [Next.js](https://nextjs.org/) application built with the App Router. It uses [TypeScript](https://www.typescriptlang.org/) for type safety and is styled with [Tailwind CSS](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/).

The core of the chat functionality is powered by [CopilotKit](https://www.copilotkit.ai/), which manages the communication with the backend and the rendering of the agent's state.

## 📂 Key Directories & Files

-   `app/`: The main directory for the Next.js App Router.
    -   `app/(auth)/`: Contains the sign-in and sign-up pages provided by Clerk.
    -   `app/api/`: Contains API routes that proxy requests to the NestJS backend. This is crucial for keeping secrets off the client.
    -   `app/c/[id]/`: The main chat interface page. The `[id]` is the conversation/thread ID.
    -   `app/layout.tsx`: The root layout of the application. It wraps the app in necessary providers like `ClerkProvider`, `ThemeProvider`, and `CopilotKit`.
    -   `app/page.tsx`: The landing page for the application.
-   `components/`: Contains all the React components.
    -   `components/chat/CustomChat.tsx`: The main chat component. It orchestrates the entire chat experience, including message display, input, and plan rendering.
    -   `components/plan/PlanPanel.tsx`: The component responsible for rendering the agent's plan and progress as it streams from the backend.
    -   `components/ui/`: Contains the UI components from shadcn/ui.
-   `context/`: Contains React context providers.
-   `stores/`: Contains Zustand stores for client-side state management (e.g., `pendingTurn.ts`).
-   `lib/`: Contains utility functions.

## 🤖 State Management

State management is handled by a combination of tools:

-   **CopilotKit**: Manages the core agent state, including the message history, the agent's plan, and the connection to the backend. It provides hooks like `useCopilotAction` and `useCoAgentStateRender`.
-   **Zustand**: Used for small pieces of client-side state that are not directly related to the agent, such as managing a pending message when navigating from the landing page to the chat page.
-   **React Context**: Used for providing global state, such as the current theme.

## 🎨 UI & Styling

-   **shadcn/ui**: Provides the core set of accessible and composable UI components.
-   **Tailwind CSS**: Used for all custom styling.
-   **`react-markdown`**: Used to render the agent's responses, which are formatted in Markdown. It is configured with a rich set of plugins for features like tables (GFM), math (KaTeX), and syntax highlighting.
-   **Framer Motion**: Used for animations, such as the sidebar collapse/expand effect.

### Markdown Rendering

The Markdown rendering pipeline is configured in `components/chat/CustomChat.tsx` and supports:
-   GitHub Flavored Markdown (tables, strikethrough, etc.)
-   KaTeX for mathematical formulas.
-   Syntax highlighting for code blocks.
-   Custom components for elements like tables and code blocks to match the application's design system.

## 🔌 API Interaction

The frontend **does not** communicate directly with the Python agent. Instead, it interacts with the NestJS backend in two ways:

1.  **CopilotKit Runtime:** The `CopilotKit` provider is configured with a `runtimeUrl` that points to `/api/copilotkit`. This Next.js API route (`app/api/copilotkit/route.ts`) acts as a proxy, forwarding all CopilotKit-related traffic to the NestJS backend. This is the primary communication channel for the agent.
2.  **Standard API Routes:** For other backend operations, such as managing secrets or conversations, the frontend calls other Next.js API routes (e.g., `/api/secrets`). These routes then make authenticated requests to the NestJS backend.

This proxy-based approach ensures that no sensitive information, such as API keys or other secrets, is ever exposed to the client.

## ⚙️ Environment Variables

The frontend is configured via environment variables in a `.env.local` file.

-   `NEXT_PUBLIC_BACKEND_URL`: The public URL of the NestJS backend.
-   `NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL`: The URL for the CopilotKit runtime, which points to the backend proxy.
-   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: The publishable key for your Clerk application.
-   `CLERK_SECRET_KEY`: The secret key for your Clerk application, used for backend operations within the Next.js app.
