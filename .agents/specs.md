# Hooksink Implementation Specifications

Based on the architecture of providing a dynamic HTTP webhook receiver with server-side JavaScript capabilities, this document specifies the implementation paths, technology choices, and crucial security considerations.

## 1. Backend: Ingress & API Server

### Tech Stack Choices
- **Runtime:** Node.js (with Express or Fastify) or Deno.
- **Why Node.js?** Has the largest ecosystem. We can use the `isolated-vm` library to securely execute user-provided JavaScript scripts by spinning up a separate V8 isolate for each request.
- **Why Deno? (Alternative)** Deno has built-in sandboxing (e.g., `--allow-none`) that makes executing untrusted code inherently safer without needing third-party C++ bindings like `isolated-vm`.

### Implementing the Sandbox (Node.js approach)
Executing untrusted JavaScript in the main Node.js event loop is highly insecure. To implement dynamic routing safely:
1. **Use `isolated-vm`:** This will create a completely distinct V8 isolate with its own memory heap.
2. **Resource Limits:** Enforce strict execution time limits (e.g., max 500ms) and memory limits (e.g., 8MB) on the isolate to prevent Denial of Service (DoS) attacks via infinite loops or memory leaks.
3. **Context Bridging:** Only inject a very limited API surface into the isolate. For instance, pass the `request` object (method, headers, body) as a plain JSON object, and expect a plain JSON object representing the `response` (status code, headers, body). Do NOT expose `require`, `fs`, or `process`.

### Real-Time Communications
- **Library:** `Socket.io` or `ws`.
- **Implementation:** When the Ingress server receives an HTTP request, it immediately formats the request metadata (headers, body, IPs) and emits a WebSocket event asynchronously. The UI clients subscribed to this stream will receive the payload instantly.

## 2. Frontend: Control Panel & Live Viewer

### Tech Stack Choices
- **Framework:** Svelte or Vue.js (via Vite). These lightweight Single Page Application (SPA) frameworks are ideal to avoid the overhead of Server-Side Rendering (SSR) and heavy Virtual DOMs, ensuring the fastest performance for incoming live WebSocket data.
- **Styling:** Tailwind CSS or custom vanilla CSS to achieve a modern, premium aesthetic (glassmorphism, dark mode, smooth transitions).
- **Authentication:** Generic OIDC client libraries suited for SPAs (e.g., `oidc-client-ts`).

### Data Flow
1. **Initial Load:** Upon OIDC login, the UI fetches historical request logs (if persisted) and the current route configuration via REST API.
2. **Live Feed:** The app establishes a WebSocket connection and pushes incoming requests directly into the reactive state to be appended to the live data table.
3. **Monaco Editor:** For writing server-side JS, embed Microsoft's Monaco Editor to provide a full IDE-like experience (syntax highlighting, intellisense) in the browser.

## 3. Database & Storage

- **Database:** SQLite (using an ORM like Drizzle or Prisma) is highly recommended for this containerized, single-node application. It is zero-setup and fast. If horizontal scaling is anticipated, use PostgreSQL.
- **Schema Requirements:**
  - `Requests`: Stores incoming request metadata (ID, timestamp, method, path, headers JSON, body).
  - `Routes`: Stores the configuration per path (e.g., `/api/test`, `is_dynamic: true`, `script_content: '...'`, `static_body: '...'`).

## 4. Docker & Infrastructure

The application will be packaged into a `docker-compose.yml` containing:
1. **app:** The combined Node.js/Deno Ingress Server and API.
2. **db (optional):** PostgreSQL container (if not using SQLite).
3. **cloudflared:** A container running the Cloudflare Tunnel daemon. This container will be configured (`config.yml`) to route ingress HTTP traffic directly to the `app` container on the appropriate port.

### Security / Network Restrictions
- Ensure the `app` container is NOT exposed to external host ports directly; it should only be accessible via the Cloudflare Tunnel.
- OIDC must strict-check the redirect URIs to prevent token hijacking.
