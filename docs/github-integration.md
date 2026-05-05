# GitHub Integration for Kivo (OpenClaw MCP)

This guide mirrors the existing Linear integration pattern and wires GitHub into Kivo through OpenClaw MCP registration at bootstrap time.

## What this implementation does

- Adds Helm values for a GitHub MCP integration with two auth modes (`pat` and `app`).
- Injects GitHub MCP env vars into both bootstrap and runtime containers.
- Registers a `github` MCP server during init-container bootstrap when enabled.
- Adds a `skills/github/SKILL.md` context file in the agent workspace.

The integration uses **PAT remote mode** by default:

- URL: `https://api.githubcopilot.com/mcp/`
- Auth header: `Authorization: Bearer <GitHub PAT>`

## Why this approach

Following the Linear pattern, Kivo configures integrations at startup via `openclaw mcp set ...`.
This keeps integration definitions in OpenClaw-managed config rather than manually editing internal files.

## Recommended server/library choices

For GitHub MCP in Kivo, use this priority order:

1. **GitHub official remote MCP server** (`api.githubcopilot.com/mcp`) for managed hosting and fast setup.
2. **GitHub official local MCP server** (`github/github-mcp-server`) when you need self-hosted/local-only execution controls.
3. Legacy/community MCP wrappers only when the two official options cannot satisfy a hard requirement.

## Auth model guidance (PAT vs GitHub App)

### PAT mode (default)

Use a fine-grained PAT when you want the simplest setup.

Minimum permissions depend on tools you expect to call. Typical examples:

- Repository metadata: `metadata:read`
- Issues: read/write as needed
- Pull requests: read/write as needed
- Contents: read (and write only if required)

### GitHub App mode

Use a GitHub App when you need tighter org-level controls, install scoping, and better auditability.

Important notes:

- GitHub Apps are generally preferred for enterprise/org automation.
- A GitHub App requires app creation, private key management, and installation per org/repo scope.
- In app mode, Kivo configures MCP as a local stdio server with env vars:
  - `GITHUB_APP_ID`
  - `GITHUB_INSTALLATION_ID`
  - `GITHUB_APP_PRIVATE_KEY`

## Helm values

### PAT mode example

```yaml
github:
  enabled: true
  authMode: pat
  mcpUrl: "https://api.githubcopilot.com/mcp/"
  secretName: kivo-github
  credentials:
    tokenKey: GITHUB_PERSONAL_ACCESS_TOKEN
```

### GitHub App mode example

```yaml
github:
  enabled: true
  authMode: app
  app:
    secretName: kivo-github-app
    idKey: GITHUB_APP_ID
    installationIdKey: GITHUB_INSTALLATION_ID
    privateKeyKey: GITHUB_APP_PRIVATE_KEY
    command: node
    scriptPath: /opt/mcp/github-app-server.js
```

## Required Kubernetes Secret

Create a Kubernetes Secret before deploying:

**PAT mode:**
```sh
kubectl create secret generic kivo-github \
  --from-literal=GITHUB_PERSONAL_ACCESS_TOKEN=<your-pat>
```

**App mode:**
```sh
kubectl create secret generic kivo-github-app \
  --from-literal=GITHUB_APP_ID=<app-id> \
  --from-literal=GITHUB_INSTALLATION_ID=<installation-id> \
  --from-literal=GITHUB_APP_PRIVATE_KEY="$(cat path/to/private-key.pem)"
```

## Operational checks

After deploy:

1. Confirm bootstrap logs include `GitHub MCP will be enabled`.
2. Confirm bootstrap logs include `Configuring GitHub MCP server via OpenClaw CLI`.
3. In the agent workspace, confirm `skills/github/SKILL.md` exists.
4. From agent interactions, verify GitHub tool discovery and a read-only call (e.g. listing repos or PRs).

## Next hardening steps

- Add optional org/repo allowlist policy in agent instructions.
- Add smoke test for MCP registration in `src/test/test-kivo.sh`.
