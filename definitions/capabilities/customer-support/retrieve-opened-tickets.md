---
id: retrieve-opened-tickets
name: Retrieve Opened Tickets
type: task_template
team_type: customer-support
featured: true
default_assigned_role: support-responder
---

# INSTRUCTIONS
Retrieve the list of opened customer support tickets.

1. **Search Tickets:** Use `ticketing.search_issues` with status ["Backlog"] (status=0) and project ID "Customer Support".
2. **Compile List:** Extract the short ticket identifier (example: "KVO-001", "KVO-002") from each ticket's `identifier` field (do NOT use the long UUID `id` field). Store these identifiers in the `ticketsList` array.

# REQUIRED INPUTS
- `projectId`: The project ID to filter by. Defaults to "Customer Support".

# EXPECTED OUTPUTS
- `ticketsList`: A JSON array of human-readable ticket identifier strings (e.g. `["KVO-001", "KVO-002]`). Do NOT return UUIDs.
