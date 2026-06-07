---
provider: linear
interface: ITicketingSystem
config:
  projectId: "Customer Support"
  statusMapping:
    "Backlog": "Backlog"
    "In Progress": "c68f978d-a708-4cd0-8bb8-055bb0ef7fc5"
    "Done": "fde11876-a60a-40e4-95b8-9c73be20a565"
---
# Connector: Ticketing (Linear Integration)
**Provider:** Linear
**Purpose:** Manage customer support tickets, issues, and workflow states.

## Actions

### `ticketing.get_details`
- **MCP Tool:** `linear_getIssueById`
- **Description:** Retrieves the full context of a customer ticket, including its title, description, history, and status.
- **Required Parameters:**
  - `id`: The unique identifier of the ticket (e.g., KVO-110).

### `ticketing.add_public_reply`
- **MCP Tool:** `linear_createComment`
- **Description:** Posts a response to the customer. This will be visible on the ticket.
- **Required Parameters:**
  - `issueId`: The unique identifier of the ticket.
  - `body`: The markdown formatted text message to send.

### `ticketing.update_status`
- **MCP Tool:** `linear_updateIssue`
- **Description:** Changes the workflow state of the ticket (e.g., 'In Progress', 'Done', 'Escalated').
- **Required Parameters:**
  - `ticketId`: The unique identifier of the ticket.
  - `status`: The new status.

### `ticketing.search_issues`
- **MCP Tool:** `linear_getProjectIssues`
- **Description:** Searches for issues under a specific project with various filter options.
- **Required Parameters:**
  - `projectId`: The unique UUID of the project.
  - `states`: An array of workflow states to filter by (e.g., ["Backlog"]).

