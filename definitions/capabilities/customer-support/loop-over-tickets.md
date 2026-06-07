---
id: loop-over-tickets
name: Loop Over Tickets
type: foreach
team_type: customer-support
featured: false
loop_over: ticketsList
loop_item: ticketId
default_assigned_role: support-lead
---

# INSTRUCTIONS
Loop through a list of customer support tickets with the objective of executing a support workflow for each ticket sequentially.

For each ticket ID in `ticketsList`:
1. Assign it as `ticketId`.

# REQUIRED INPUTS
- `ticketsList`: Array of ticket IDs to process.

# EXPECTED OUTPUTS
