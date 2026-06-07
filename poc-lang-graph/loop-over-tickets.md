---
id: loop-over-tickets
name: Loop Over Tickets
type: foreach
loop_over: pendingTickets
loop_item: ticketId
---

# INSTRUCTIONS
Loop through a list of customer tickets and run the next workflow capability for each of them.

1. **Foreach Item:** For each ticket in `pendingTickets`, assign it as `ticketId`.

# REQUIRED INPUTS
- `pendingTickets`: The list of pending ticket IDs.

# EXPECTED OUTPUTS
- `loopResults`: A summary of the execution results for the batch.
