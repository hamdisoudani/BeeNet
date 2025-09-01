# Beenet Backend - Developer's Guide

This document provides a deep dive into the Beenet backend for developers. The backend is a [NestJS](https://nestjs.com/) application that serves as a secure proxy and persistence layer for the Beenet agentic chat application.

For setup and installation instructions, please see the [main README](../../README.md).

## 🛡️ Role and Responsibilities

The backend has several critical responsibilities:

1.  **Secure Proxy:** It acts as a secure intermediary between the frontend and the Python agent. All requests to the agent are routed through this backend.
2.  **Authentication:** It uses [Clerk](https://clerk.com/) to protect all its endpoints, ensuring that only authenticated users can access the application.
3.  **Persistence:** It connects to a MongoDB database to save and retrieve user data, including conversations, messages, and secrets.
4.  **Secrets Management:** It securely manages user-provided API keys (e.g., for LLM providers and Tavily), encrypting them at rest before storing them in the database.
5.  **Configuration Injection:** It injects the necessary API keys and other configuration into the requests it forwards to the Python agent, so the agent itself doesn't need to handle user-specific secrets.

## 🏗️ Architecture & Modules

The backend is built with a modular architecture, with each module handling a specific concern:

-   **`AppModule`**: The root module of the application.
-   **`ProxyModule`**: Contains the `ProxyController`, which handles all requests prefixed with `/copilotkit`. It forwards these requests to the Python agent, adding authentication and necessary headers.
-   **`SecretsModule`**: Manages user secrets, including API keys. It provides endpoints for creating, reading, updating, and deleting secrets.
-   **`MessagesModule`**: Handles the persistence of conversations and messages.
-   **`AuthModule`**: Contains the `ClerkAuthGuard`, which is used to protect routes.

## 🔌 API Endpoints

All endpoints are prefixed with `/api`. Here are the main custom endpoints:

-   `GET /api/secrets`: Get the current user's secrets (models and Tavily key status).
-   `PUT /api/secrets`: Upsert a model for the current user.
-   `PUT /api/secrets/default`: Set the default model for the current user.
-   `PUT /api/secrets/tavily`: Save the Tavily API key for the current user.
-   `POST /api/secrets/tavily/remove`: Remove the Tavily API key for the current user.
-   `POST /api/conversations/init`: Initialize a new conversation.
-   `GET /api/conversations`: Get all conversations for the current user.
-   `POST /api/messages/turn`: Save a turn (user message, agent state, assistant message) to the database.
-   `GET /api/messages?threadId=...`: Get all messages for a specific conversation.

In addition to these, the `ProxyController` handles all requests to `/copilotkit*` and forwards them to the Python agent.

## 💾 Database Schema

The backend uses Mongoose to interact with a MongoDB database. The schemas are defined in the `src/schemas/` directory.

-   **`user-secrets.schema.ts`**: Stores user-specific secrets.
    -   `userId`: The Clerk user ID.
    -   `models`: An array of subdocuments, each containing a user's model configuration (`name`, `baseUrl`, `apiKeyEnc`, etc.).
    -   `tavilyApiKeyEnc`: The user's encrypted Tavily API key.
-   **`conversation.schema.ts`**: Stores metadata for each conversation.
    -   `userId`: The Clerk user ID.
    -   `threadId`: The unique ID for the conversation thread.
    -   `title`: The title of the conversation.
-   **`message.schema.ts`**: Stores each message in a conversation.
    -   `userId`: The Clerk user ID.
    -   `conversationId`: The ID of the conversation this message belongs to.
    -   `turnId`: An ID that groups a user message, agent state, and assistant response together.
    -   `role`: The role of the message sender (`user`, `assistant`, or `agent_state`).
    -   `content`: The content of the message.

## 🔐 Security Features

-   **Authentication:** All routes are protected by the `ClerkAuthGuard`, which validates the JWT from the `__session` cookie or the `Authorization` header.
-   **Encryption at Rest:** API keys in the `user_secrets` collection are encrypted using AES-256-GCM. The encryption key is provided via the `DATA_KEY` environment variable.
-   **HMAC Signing:** Requests from the backend to the Python agent are signed with an HMAC signature. The agent verifies this signature to ensure that requests are coming from a trusted source. The shared secret is provided via the `PROXY_SHARED_SECRET` environment variable.
-   **CORS:** Cross-Origin Resource Sharing is configured to only allow requests from the frontend's origin.
-   **Rate Limiting:** The application has a global rate limiter, with stricter limits on sensitive endpoints.

## ⚙️ Environment Variables

The backend is configured via environment variables in a `.env` file.

-   `PORT`: The port for the server to run on.
-   `FRONTEND_ORIGIN`: The URL of the frontend application.
-   `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`: Your Clerk API keys.
-   `MONGODB_URI`: The connection string for your MongoDB database.
-   `AGENT_URL`: The URL of the Python agent's CopilotKit endpoint.
-   `DATA_KEY`: A 32-byte base64 encoded string for data encryption.
-   `PROXY_SHARED_SECRET`: A shared secret for HMAC signing of requests to the agent.
