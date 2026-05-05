# TOOLS

> [!CAUTION]
> **CRITICAL RUNTIME WARNING**: You are in a restricted container.
> - **DO NOT** attempt to use `systemctl`, `systemd`, or `openclaw plugin` commands.

## Task & Team Management (Kivo)

For all task, team, and request operations, you **MUST** use the native Kivo MCP tools (e.g., `list_tasks`, `get_task`, `create_task`, `update_task`, `list_subtasks`, `list_requests`, `get_team`, `update_team`).
These tools are pre-installed in your environment. Do not attempt to use `curl` or raw HTTP requests to interact with the Kivo API.

