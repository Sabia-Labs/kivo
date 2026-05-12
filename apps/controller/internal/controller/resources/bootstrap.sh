#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# kivo-agent bootstrap.sh
#
# Runs as an initContainer on FIRST BOOT ONLY (guarded by .bootstrapped flag).
# On subsequent pod restarts, the PVC already has .bootstrapped → script exits.
#
# Responsibilities:
#   1. Run openclaw non-interactive onboarding
#   2. Configure Telegram channel
#   3. Configure MCP servers (Linear, GitHub) — paths baked into image
#   4. Fetch dynamic profile files from Kivo API to PVC
#      ↳ Files evolve on the PVC after first boot; never overwritten here.
#   5. Touch .bootstrapped to prevent re-seeding on restart
# ─────────────────────────────────────────────────────────────────────────────
set -eu

export HOME=/home/node
export OPENCLAW_CONFIG_DIR=/home/node/.openclaw

mkdir -p "$OPENCLAW_CONFIG_DIR"
mkdir -p "$OPENCLAW_CONFIG_DIR/workspace"

# MCP packages are pre-installed in the image (no npm install at runtime)
MCP_PACKAGES_DIR="${MCP_PACKAGES_DIR:-/opt/mcp-packages}"



# ── Main (first-boot gate) ────────────────────────────────────────────────────

if [ ! -f "$OPENCLAW_CONFIG_DIR/.bootstrapped" ]; then
  echo "==> First boot: running non-interactive onboarding"

  openclaw onboard --non-interactive \
    --accept-risk \
    --skip-health \
    --mode local \
    --secret-input-mode ref \
    --gateway-auth token \
    --gateway-token-ref-env OPENCLAW_GATEWAY_TOKEN \
    --workspace "$OPENCLAW_CONFIG_DIR/workspace" \
    --json

  # (Telegram channel configured after first-boot gate — see below)

  # ── Model config ─────────────────────────────────────────────────────────
  PROVIDER="${ACTIVE_PROVIDER:-gemini}"
  if [ "$PROVIDER" = "google" ]; then PROVIDER="gemini"; fi

  MODEL_NAME="${ACTIVE_MODEL_NAME:-}"

  if [ "$PROVIDER" = "openai" ]; then
    PRIMARY_MODEL="openai/${MODEL_NAME:-gpt-5.4}"
    FALLBACK_MODEL="openai/gpt-5.4"
  elif [ "$PROVIDER" = "gemini" ]; then
    PRIMARY_MODEL="google/${MODEL_NAME:-gemini-2.5-flash}"
    FALLBACK_MODEL="google/gemini-2.0-flash"
  else
    echo "Unknown provider: $PROVIDER (accepted: openai, gemini, google)"
    exit 1
  fi

  CONFIG_FILE="$OPENCLAW_CONFIG_DIR/openclaw.json"
  cat >"$CONFIG_FILE" <<EOF
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "port": 18789,
    "auth": { "mode": "token" },
    "controlUi": { "enabled": false }
  },
  "channels": {
    "qa-channel": {
      "baseUrl": "http://127.0.0.1:43123",
      "botUserId": "kivo",
      "botDisplayName": "Kivo QA",
      "allowFrom": ["*"],
      "pollTimeoutMs": 5000
    }
  },
  "agents": {
    "defaults": {
      "workspace": "~/.openclaw/workspace",
      "subagents": { "allowAgents": ["*"] },
      "model": {
        "primary": "$PRIMARY_MODEL",
        "fallbacks": ["$FALLBACK_MODEL"]
      }
    }
  }
}
EOF

  # ── Seed profile files (FIRST BOOT ONLY) ─────────────────────────────────
  # Source: Kivo API (dynamic from database templates)
  # Destination: $OPENCLAW_CONFIG_DIR/workspace/
  #
  # IMPORTANT: These files will evolve over time on the PVC.
  # This block runs ONCE. The .bootstrapped flag prevents re-seeding on restart.
  
  echo "==> Fetching dynamic bootstrap files from Kivo API..."
  BOOTSTRAP_URL="${KIVO_API_INTERNAL_URL}/internal/v1/agents/${AGENT_ID}/bootstrap-data"
  
  node -e "
const fs = require('fs');
const path = require('path');

async function fetchBootstrap() {
  const url = '$BOOTSTRAP_URL';
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  const workspace = '$OPENCLAW_CONFIG_DIR/workspace';

  console.log('Fetching from: ' + url);
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()));
    
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'API reported failure');

    const files = json.data.files;
    for (const [filename, content] of Object.entries(files)) {
      const fullPath = path.join(workspace, filename);
      console.log('  -> Writing ' + filename);
      fs.writeFileSync(fullPath, content);
    }
    console.log('Bootstrap files written successfully.');
  } catch (err) {
    console.error('Failed to fetch bootstrap data:', err.message);
    process.exit(1);
  }
}

fetchBootstrap();
"

  # ── Seed shared skills (FIRST BOOT ONLY) ─────────────────────────────────
  SHARED_SKILLS_SRC="/opt/kivo/profiles/shared/skills"
  if [ -d "$SHARED_SKILLS_SRC" ]; then
    echo "==> Seeding shared skills from $SHARED_SKILLS_SRC (first boot only)"
    mkdir -p "$OPENCLAW_CONFIG_DIR/workspace/skills"
    cp -r "$SHARED_SKILLS_SRC/"* "$OPENCLAW_CONFIG_DIR/workspace/skills/"
  fi

  echo "==> Creating symlink for openclaw.json"
  ln -sf "$CONFIG_FILE" "$OPENCLAW_CONFIG_DIR/workspace/openclaw.json"

  touch "$OPENCLAW_CONFIG_DIR/.bootstrapped"
  echo "==> Bootstrap complete"
else
  echo "==> Already bootstrapped — skipping (PVC state preserved)"
fi

# ── Linear MCP (packages pre-installed in image) ─────────────────────────
# Runs every boot to pick up new API keys
ENABLE_LINEAR_MCP=false
if [ "${LINEAR_ENABLED:-false}" = "true" ] && [ -n "${LINEAR_API_KEY:-}" ]; then
  ENABLE_LINEAR_MCP=true
  echo "==> Linear MCP enabled"
fi

if [ "$ENABLE_LINEAR_MCP" = "true" ]; then
  LINEAR_MCP_BIN="$MCP_PACKAGES_DIR/node_modules/@sylphx/linear-mcp/dist/index.js"
  JSON_ARG="{\"command\":\"node\",\"args\":[\"$LINEAR_MCP_BIN\"],\"env\":{\"LINEAR_API_KEY\":\"${LINEAR_API_KEY}\"}}"
  openclaw mcp set linear "$JSON_ARG"

  mkdir -p "$OPENCLAW_CONFIG_DIR/workspace/skills/linear"
  cat >"$OPENCLAW_CONFIG_DIR/workspace/skills/linear/SKILL.md" <<'SKILL_EOF'
---
name: linear
description: Manage Linear issues, projects, and teams natively via MCP.
metadata: { "openclaw": { "emoji": "🔗" } }
---

# Linear Integration

You have direct access to Linear through native MCP tools.

## Available Native Tools:
- `mcp_linear_list_issues`, `mcp_linear_get_issue`, `mcp_linear_create_issue`, `mcp_linear_update_issue`
- `mcp_linear_list_teams`, `mcp_linear_list_projects`, `mcp_linear_create_comment`
SKILL_EOF
fi

# ── GitHub MCP (packages pre-installed in image) ──────────────────────────
# Runs every boot to pick up new tokens/keys
ENABLE_GITHUB_MCP=false
GITHUB_AUTH_MODE="${GITHUB_AUTH_MODE:-pat}"
if [ "${GITHUB_ENABLED:-false}" = "true" ]; then
  if [ "$GITHUB_AUTH_MODE" = "pat" ] && [ -n "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
    ENABLE_GITHUB_MCP=true
    echo "==> GitHub MCP enabled (PAT mode)"
  elif [ "$GITHUB_AUTH_MODE" = "app" ] && [ -n "${GITHUB_APP_ID:-}" ]; then
    ENABLE_GITHUB_MCP=true
    echo "==> GitHub MCP enabled (App mode)"
  fi
fi

if [ "$ENABLE_GITHUB_MCP" = "true" ]; then
  GITHUB_MCP_BIN="$MCP_PACKAGES_DIR/node_modules/@modelcontextprotocol/server-github/dist/index.js"

  if [ "$GITHUB_AUTH_MODE" = "pat" ]; then
    JSON_ARG="{\"command\":\"node\",\"args\":[\"$GITHUB_MCP_BIN\"],\"env\":{\"GITHUB_PERSONAL_ACCESS_TOKEN\":\"${GITHUB_PERSONAL_ACCESS_TOKEN}\"}}"
  else
    JSON_ARG="{\"command\":\"node\",\"args\":[\"$GITHUB_MCP_BIN\"],\"env\":{\"GITHUB_APP_ID\":\"${GITHUB_APP_ID}\",\"GITHUB_INSTALLATION_ID\":\"${GITHUB_INSTALLATION_ID}\",\"GITHUB_APP_PRIVATE_KEY\":\"${GITHUB_APP_PRIVATE_KEY}\"}}"
  fi

  openclaw mcp set github "$JSON_ARG"

  mkdir -p "$OPENCLAW_CONFIG_DIR/workspace/skills/github"
  cat >"$OPENCLAW_CONFIG_DIR/workspace/skills/github/SKILL.md" <<'SKILL_EOF'
---
name: github
description: Manage repositories, pull requests, and issues in GitHub via MCP.
metadata: { "openclaw": { "emoji": "🐙" } }
---

# GitHub Integration

You have direct access to GitHub through native MCP tools.
Use these tools for repository discovery, issue triage, and pull-request workflows.
SKILL_EOF
fi

# ── Kivo API MCP ─────────────────────────────────────────────────────────
# Runs every boot
echo "==> Configuring Kivo API MCP"
KIVO_API_URL="${KIVO_API_URL:-http://kivo-api.kivo.svc.cluster.local:4000}/mcp/sse?token=${OPENCLAW_GATEWAY_TOKEN:-}"
KIVO_JSON_ARG="{\"type\":\"sse\",\"url\":\"$KIVO_API_URL\",\"headers\":{\"Authorization\":\"Bearer ${OPENCLAW_GATEWAY_TOKEN:-}\"}}"
openclaw mcp set kivo "$KIVO_JSON_ARG"

# ── Telegram channel (runs every boot) ───────────────────────────────────────────
#
# Runs outside the .bootstrapped gate so a new TELEGRAM_BOT_TOKEN (updated
# via the Kivo UI and injected into the K8s Secret) is picked up on every
# pod start without requiring PVC manipulation.
#
# `openclaw channels add` is idempotent: calling it again with the same or a
# new token simply reconfigures the channel. The `|| true` ensures the script
# does not abort if the command exits non-zero (e.g. token not yet valid).

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "==> Configuring Telegram channel (token present)"
  openclaw channels add \
    --channel telegram \
    --token "$TELEGRAM_BOT_TOKEN" || true
else
  echo "==> Telegram channel not configured (TELEGRAM_BOT_TOKEN not set)"
fi
