# Hooksink Architecture Overview

This project provides an HTTP request inspection and dynamic handling service. It consists of an HTTP server exposed via Cloudflare (CF) Tunnels and a web interface for real-time monitoring and configuration.

## Core Architecture

### 1. Request Receiver / Ingress Server
- **Purpose:** Acts as the primary endpoint for incoming webhooks and HTTP traffic, routed securely via CF Tunnels.
- **Features:**
  - **Inspection:** Captures full details of incoming HTTP requests, including method, path, headers, query parameters, and raw body payload.
  - **Dynamic Routing & Handlers:** Instead of just logging, the server can be configured per-route to:
    - Respond with user-provided static files.
    - Execute user-provided server-side JavaScript (e.g., using a JS runtime sandbox) to generate dynamic HTTP responses.

### 2. Web Interface & API
- **Purpose:** A control panel for users to view request logs and manage server behavior.
- **Features:**
  - **Real-time Monitoring:** Uses WebSockets to stream incoming HTTP requests to the UI as they arrive.
  - **Configuration:** Allows the user to map specific routes to static files or write the server-side JS functions directly within the browser.
  - **Authentication:** The entire interface and its API are protected by OIDC (OpenID Connect), ensuring only authorized users can access the logs and modify the server configuration.

### 3. Infrastructure & Deployment
- **Docker Compose:** The entire system is containerized and orchestrated using `docker-compose`. This ensures all services (the web interface frontend, the API backend, the dynamic HTTP Ingress server, and any required databases or message brokers) are connected via an internal Docker network and easily deployable on the host machine.
- **Cloudflare Tunnels:** Used to securely expose the internal Ingress Server to the public internet without needing to open firewall ports or port-forward.

## Agent Guidelines
- **Context:** When modifying this project, remember that the web UI needs to maintain WebSocket connections to the backend to instantly reflect requests received by the Ingress Server.
- **Security:** Ensure any server-side JS execution environment is appropriately sandboxed, as users will be writing arbitrary JS to shape HTTP responses.
- **Auth:** OIDC must be respected for all control-plane APIs; however, the public Ingress routes (hook endpoints) are typically unauthenticated unless specified by the user's custom JS handler.
