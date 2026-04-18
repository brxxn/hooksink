# Hooksink Production Deployment Setup

This guide strictly details how to execute a Production deployment of the Hooksink service, pulling the pre-built Docker image directly from GitHub Container Registry (GHCR/GCR) compiled via GitHub Actions.

## 1. Directory Setup

On your host machine, create an isolated directory to hold your deployment configuration:

```bash
mkdir -p /opt/hooksink
cd /opt/hooksink
```

## 2. Environment Variables (`.env`)

You need to establish the precise runtime secrets. Inside the deployment directory, create an `.env` file (`nano .env`):

```bash
# ==========================================
# 1. OpenID Connect
# ==========================================
# The strict URL of your OIDC Provider
OIDC_ISSUER=https://your.oidc.issuer
# Your OIDC Application Credentials
OIDC_CLIENT_ID=your_client_id
OIDC_CLIENT_SECRET=your_client_secret
# Unique cryptographic string protecting the Session Cookies (generate via `openssl rand -hex 32`)
OIDC_SESSION_SECRET=your_generated_random_secret
# The base URL of your control interface (e.g., https://hooksink.domain.com)
OIDC_BASE_URL=https://hooksink.yourdomain.com

# ==========================================
# 2. Cloudflare Zero Trust (Ingress)
# ==========================================
# Tunnel token ensuring strict, dark traffic traversal to the app and ingress ports
CLOUDFLARE_TUNNEL_TOKEN=eyJ...your...cloudflare...token...
```

## 3. Deployment Configuration (`docker-compose.yml`)

Create the `docker-compose.yml` file. Notice that instead of compiling the image physically (`build: .`), we securely mount the pre-built Docker Tag natively pulled out of GHCR!

```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: hooksink
      POSTGRES_PASSWORD: hooksink_password
      POSTGRES_DB: hooksink_db
    # SECURITY: Database port is intentionally NOT exposed to the host machine.
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - internal
      
  app:
    image: ghcr.io/brxxn/hooksink:latest
    ports:
      - "127.0.0.1:3002:3002"
    environment:
      - DATABASE_URL=postgresql://hooksink:hooksink_password@db:5432/hooksink_db?schema=public
      - MAX_BODY_SIZE=5mb
      - API_PORT=3000
      - INGRESS_PORT=3001
      - METRICS_PORT=3002
      - OIDC_ISSUER=${OIDC_ISSUER}
      - OIDC_CLIENT_ID=${OIDC_CLIENT_ID}
      - OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET}
      - OIDC_SESSION_SECRET=${OIDC_SESSION_SECRET}
      - OIDC_BASE_URL=${OIDC_BASE_URL}
    depends_on:
      - db
    restart: unless-stopped
    networks:
      - internal

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
    networks:
      - internal

volumes:
  postgres_data:

networks:
  internal:
    driver: bridge
```

## 4. Launching the Production Stack

Once the `.env` configuration and the Compose schema are correctly written, kick off the stack:

```bash
# Pull the latest authenticated image explicitly from the remote container registry
docker compose pull app

# Build up the stack into memory in Detached Mode
docker compose up -d

# Observe the boot sequence to ensure PostgreSQL initialization and App sync succeeded
docker compose logs -f
```

## 5. Maintenance / Updates

Whenever Github Actions pushes a new version flag sequentially updating your production stack, all you do natively is run:

```bash
cd /opt/hooksink
docker compose pull app
docker compose up -d
```
The stack will smoothly deprecate the old container mapping and execute the updated schema safely bridging off your Database volume!
