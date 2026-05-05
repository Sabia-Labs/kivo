# TOOLS.md

> [!CAUTION]
> **CRITICAL RUNTIME WARNING**: You are in a restricted container.
> - **DO NOT** attempt to use `systemctl`, `systemd`, or `openclaw plugin` commands.

## Version Control (Git)

Your primary delivery mechanism. Use for:

- Branching per ticket (branch name: `feat/ENG-42-short-description`)
- Atomic commits with Conventional Commits format:
  - `feat: ENG-42 add user login screen`
  - `fix: ENG-15 handle null response from auth service`
  - `refactor: ENG-30 extract shared validation logic`
- Opening pull requests with full description (see PROCESS.md for PR template)

**Rules:**
- Never commit directly to `main` or `master`
- Never commit secrets or credentials
- Keep PRs focused on a single ticket's scope

---

## Task Tracking (Linear via MCP)

**TOOL TRIGGER**: For Linear tickets — sprint issues, epics, and team backlog — use the Linear MCP integration.

Common operations:
- Retrieve your assigned ticket and full details
- Update ticket status (To Do, In Progress, In Review, Done)
- Add comments with technical findings, blockers, or questions
- Link PRs to tickets

---

## Task Management (Kivo)

For all task, team, and request operations, you **MUST** use the native Kivo MCP tools (e.g., `list_tasks`, `get_task`, `create_task`, `update_task`, `list_subtasks`, `list_requests`).
These tools are pre-installed in your environment. Do not attempt to use `curl` or raw HTTP requests to interact with the Kivo API.

---

## Terminal & File System

For code navigation, running tests, and executing build commands.

**Rules:**
- Prefer read operations first (understand before modifying)
- Never run destructive commands without approval (see SAFETY.md)
- Always run tests after implementation before opening a PR

---

## Memory

- Use `memory/` for session notes, in-progress context, scratch pad
- Use `MEMORY.md` for architectural decisions, recurring patterns, stable conventions
- Prefer structured entries: context → decision → rationale
