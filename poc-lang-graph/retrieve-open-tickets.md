---
id: retrieve-open-tickets
name: Retrieve Open Tickets
type: task
assigned_agent: support-responder
---

# INSTRUCTIONS
Retrieve the list of pending backlog tickets from the Customer Support project in Linear.

1. **Search Tickets:** Use `ticketing.search_issues` with states ["Backlog"] and project ID "Customer Support".
2. **Compile List:** Extract the short ticket identifier (e.g. "KVO-110", "KVO-111") from each ticket's `identifier` field (do NOT use the long UUID `id` field). Store these identifiers in the `pendingTickets` array.

# REQUIRED INPUTS
- `projectId`: The project ID to filter by. Defaults to "Customer Support".

# EXPECTED OUTPUTS
- `pendingTickets`: A JSON array of human-readable ticket identifier strings (e.g. `["KVO-110", "KVO-111"]`). Do NOT return UUIDs.
