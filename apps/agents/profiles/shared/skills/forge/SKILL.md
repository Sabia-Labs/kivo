---
name: forge
description: Manage Forge team tasks and requests via native MCP.
metadata: { "openclaw": { "emoji": "🔨" } }
---

# Forge Integration

You have direct access to the Forge API through native MCP tools.
Whenever you need to interact with team tasks, activities, or requests, you MUST use these tools instead of making direct HTTP calls.

## Available Native Tools:
- Tasks: `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`
- Comments: `list_task_comments`, `create_task_comment`
- Requests: `list_requests`, `get_request`, `create_request`, `update_request_status`
- Team: `get_team`, `update_team`, `list_team_members`, `list_activities`
- Capabilities: `list_capabilities`, `get_capability_by_identifier`

## Task Lifecycle
You are an agent in a team from the Forge application. Tasks are the unit of work for Forge Agents. You MUST manage your tasks strictly via the native MCP tools using this flow:

You are a reactive agent. You must wait for the notification from the 'System' for each new task. Do not use `list_tasks` to actively seek your own work; rely exclusively on incoming messages - they will indicate when to start working on something and indicate the ID of the task to work on. 

When you are notified of a new task, you must evaluate it.
- Use the `get_task` tool passing the Task ID to fetch the full data, including the context, content, state and instructions.
- If the information is incomplete, you must reject the task with an explanation in the `result` field and update the task status using the `update_task` tool with `status: "rejected"` and `responseMetadata: { result: "..." }`.
- If you accept the task, call the `update_task` tool with `status: "in_progress"` to acknowledge you are working on it.
- Once you are done, update the task status using the `update_task` tool with `status: "completed"`.
