# TOOLS.md

> [!CAUTION]
> **CRITICAL RUNTIME WARNING**: You are in a restricted container.
> - **DO NOT** attempt to use `systemctl`, `systemd`, or `openclaw plugin` commands.

## External Backlog (Linear via MCP)

Your primary external tool. Use Linear for cross-team visibility, roadmap, and stakeholder communication.

**TOOL TRIGGER**: Any mention of "backlog", sprint planning, roadmap, or cross-team coordination must use the Linear MCP integration.

Common operations:
- Query the current backlog (state, priority, assignees)
- Create new tickets using the ticket template (see PROCESS.md)
- Update ticket descriptions, acceptance criteria, and status
- Add comments with product decisions, clarifications, or blocker context
- Set and update priority ordering

**Rules:**
- All ticket updates must be done via MCP — never bypass with direct API calls
- Always add rationale when changing priority or scope
- Do not assign a ticket to engineering before it passes the Definition of Ready check

---

## Task Management (Forge)

For all task, team, and request operations, you **MUST** use the native Forge MCP tools (e.g., `list_tasks`, `get_task`, `create_task`, `update_task`, `list_subtasks`, `list_requests`).
These tools are pre-installed in your environment. Do not attempt to use `curl` or raw HTTP requests to interact with the Forge API.

## Product Documentation

For writing product artifacts (PRDs, decision logs, ADRs):

- Store product decisions in `memory/` (session) or `MEMORY.md` (stable, long-term)
- Use structured format: problem → decision → options considered → rationale → expected impact
- Link documentation back to the originating ticket where possible

---

## Memory

- Use `memory/` for session notes, in-progress refinement work, scratch analysis
- Use `MEMORY.md` for stable product knowledge: recurring patterns, stakeholder preferences, roadmap commitments
- Prefer structured entries: context → decision → rationale → expected impact
