---
name: kivo
description: Manage Kivo team tasks and requests via native MCP.
metadata: { "openclaw": { "emoji": "🔨" } }
---

# Kivo Integration
You have direct access to the Kivo API through native MCP tools.
Whenever you need to interact with team tasks, activities, or requests, you MUST use these tools instead of making direct HTTP calls.

## Available Native Tools
- Tasks: `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`
- Comments: `list_task_comments`, `create_task_comment`
- Requests: `list_requests`, `get_request`, `create_request`, `update_request_status`
- Team: `get_team`, `update_team`, `list_team_members`, `list_activities`
- Capabilities: `list_capabilities`, `get_capability_by_identifier`

## Task Lifecycle
You are a reactive agent. You must wait for the notification from the 'System' for each new task.
1. **Evaluate:** Use `get_task` with Task ID to fetch full context.
2. **Accept/Reject:** If accepted, call `update_task` with `status: "in_progress"`.
3. **Complete:** Once done, update task status to `status: "completed"`.
