FROM ghcr.io/openclaw/openclaw:2026.4.9

# ── Shared Skills seed templates ────────────────────────────────────────────────
# Shared skills (e.g., native kivo integration) are pre-baked into the image.
# bootstrap.sh copies them to the PVC workspace at FIRST BOOT ONLY.
COPY profiles/ /opt/kivo/profiles/



# ── MCP packages (pre-installed — no npm install at runtime) ──────────────────
# Installing here avoids network calls during agent startup and makes
# startup time deterministic regardless of npm registry availability.
# The openclaw base image runs as USER node (uid 1000), so we temporarily
# switch to root to create + own the target directory, then install as node.
ENV MCP_PACKAGES_DIR=/opt/mcp-packages

USER root
RUN mkdir -p $MCP_PACKAGES_DIR && chown -R node:node $MCP_PACKAGES_DIR

USER node
RUN npm install --prefix $MCP_PACKAGES_DIR --save \
    @sylphx/linear-mcp \
    @modelcontextprotocol/server-github \
    && npm cache clean --force
