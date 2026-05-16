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
# Disable config watchers and anomalies during bootstrap to save IO/CPU
export OPENCLAW_OBSERVE_CONFIG=false
export OPENCLAW_TELEMETRY=false

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

  touch "$OPENCLAW_CONFIG_DIR/.bootstrapped"
  echo "==> Bootstrap core complete"
else
  echo "==> Already bootstrapped — skipping onboarding (PVC state preserved)"
fi

# ── Seed shared skills (Runs every boot to keep instructions fresh) ──────────
SHARED_SKILLS_SRC="/opt/kivo/profiles/shared/skills"
if [ -d "$SHARED_SKILLS_SRC" ]; then
  echo "==> Syncing shared skills from $SHARED_SKILLS_SRC"
  mkdir -p "$OPENCLAW_CONFIG_DIR/workspace/skills"
  cp -r "$SHARED_SKILLS_SRC/"* "$OPENCLAW_CONFIG_DIR/workspace/skills/"
fi

# ── Configuration (Runs every boot) ───────────────────────────────────────────

# Helper to update openclaw.json directly (faster/reliable than openclaw mcp set during bootstrap)
update_mcp_config() {
  SERVER_NAME="$1"
  SERVER_JSON="$2"
  node -e "
    const fs = require('fs');
    const configPath = '$OPENCLAW_CONFIG_DIR/openclaw.json';
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Clean up any old/invalid locations that cause crashes
      if (config.gateway && config.gateway.mcp) delete config.gateway.mcp;
      
      config.mcp = config.mcp || { servers: {} };
      config.mcp.servers = config.mcp.servers || {};
      config.mcp.servers['$SERVER_NAME'] = $SERVER_JSON;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
  "
}

# ── Linear MCP
if [ "${LINEAR_ENABLED:-false}" = "true" ] && [ -n "${LINEAR_API_KEY:-}" ]; then
  echo "==> Linear MCP enabled"
  LINEAR_MCP_BIN="$MCP_PACKAGES_DIR/node_modules/@sylphx/linear-mcp/dist/index.js"
  update_mcp_config "linear" "{\"command\":\"node\",\"args\":[\"$LINEAR_MCP_BIN\"],\"env\":{\"LINEAR_API_KEY\":\"${LINEAR_API_KEY}\"}}"

  mkdir -p "$OPENCLAW_CONFIG_DIR/workspace/skills/linear"
  cat >"$OPENCLAW_CONFIG_DIR/workspace/skills/linear/SKILL.md" <<'SKILL_EOF'
---
name: linear
description: Manage Linear issues, projects, and teams natively via MCP.
metadata: { "openclaw": { "emoji": "🔗" } }
---

# Linear Integration

You have direct access to Linear through native MCP tools.
SKILL_EOF
fi

# ── GitHub MCP
GITHUB_AUTH_MODE="${GITHUB_AUTH_MODE:-pat}"
if [ "${GITHUB_ENABLED:-false}" = "true" ]; then
  GITHUB_MCP_BIN="$MCP_PACKAGES_DIR/node_modules/@modelcontextprotocol/server-github/dist/index.js"
  if [ "$GITHUB_AUTH_MODE" = "pat" ] && [ -n "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
    echo "==> GitHub MCP enabled (PAT mode)"
    update_mcp_config "github" "{\"command\":\"node\",\"args\":[\"$GITHUB_MCP_BIN\"],\"env\":{\"GITHUB_PERSONAL_ACCESS_TOKEN\":\"${GITHUB_PERSONAL_ACCESS_TOKEN}\"}}"
  elif [ "$GITHUB_AUTH_MODE" = "app" ] && [ -n "${GITHUB_APP_ID:-}" ]; then
    echo "==> GitHub MCP enabled (App mode)"
    update_mcp_config "github" "{\"command\":\"node\",\"args\":[\"$GITHUB_MCP_BIN\"],\"env\":{\"GITHUB_APP_ID\":\"${GITHUB_APP_ID}\",\"GITHUB_INSTALLATION_ID\":\"${GITHUB_INSTALLATION_ID}\",\"GITHUB_APP_PRIVATE_KEY\":\"${GITHUB_APP_PRIVATE_KEY}\"}}"
  fi
fi

# ── Notion MCP
if [ "${NOTION_ENABLED:-false}" = "true" ] && [ -n "${NOTION_ACCESS_TOKEN:-}" ]; then
  echo "==> Notion MCP enabled"
  
  # Detect Notion MCP binary across possible package structures
  NOTION_MCP_BIN=""
  for bin_path in "bin/cli.mjs" "dist/index.js" "build/index.js"; do
    if [ -f "$MCP_PACKAGES_DIR/node_modules/@notionhq/notion-mcp-server/$bin_path" ]; then
      NOTION_MCP_BIN="$MCP_PACKAGES_DIR/node_modules/@notionhq/notion-mcp-server/$bin_path"
      break
    fi
  done

  if [ -n "$NOTION_MCP_BIN" ]; then
    echo "  -> Found Notion MCP at: $NOTION_MCP_BIN"
    update_mcp_config "notion" "{\"command\":\"node\",\"args\":[\"$NOTION_MCP_BIN\"],\"env\":{\"NOTION_TOKEN\":\"${NOTION_ACCESS_TOKEN}\"}}"
  else
    echo "  !! ERROR: Notion MCP package found in image, but executable not found in node_modules."
    echo "  !! Checked: bin/cli.mjs, dist/index.js, build/index.js"
    echo "  !! Integration will be disabled for this agent."
  fi

  # Ensure the skill is available
  mkdir -p "$OPENCLAW_CONFIG_DIR/workspace/skills/notion"
  cat >"$OPENCLAW_CONFIG_DIR/workspace/skills/notion/SKILL.md" <<'SKILL_EOF'
---
name: notion
description: Manage Notion pages, databases, and search natively via MCP.
metadata: { "openclaw": { "emoji": "📓" } }
---

# Notion Integration

You have direct access to Notion through native MCP tools.
SKILL_EOF
fi

# ── Kivo API MCP
echo "==> Configuring Kivo API MCP"
MCP_API_BASE="${KIVO_API_INTERNAL_URL:-http://kivo-api.${KIVO_NAMESPACE:-kivo}.svc.cluster.local:4000}"
KIVO_MCP_URL="${MCP_API_BASE}/mcp/sse?token=${OPENCLAW_GATEWAY_TOKEN:-}"
update_mcp_config "kivo" "{\"type\":\"sse\",\"url\":\"$KIVO_MCP_URL\",\"headers\":{\"Authorization\":\"Bearer ${OPENCLAW_GATEWAY_TOKEN:-}\"}}"

# ── Telegram channel
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "==> Configuring Telegram channel (token present)"
  openclaw channels add \
    --channel telegram \
    --token "$TELEGRAM_BOT_TOKEN" || true
else
  echo "==> Telegram channel not configured"
fi

echo "==> Bootstrap script finished"
