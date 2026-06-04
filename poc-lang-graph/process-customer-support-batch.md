---
id: process-customer-support-batch
name: Process Customer Support Batch
type: foreach
loop_over: pendingTickets
loop_item: ticketId
run_workflow: customer-support-resolution-flow
---

# INSTRUCTIONS
Loop through a list of customer tickets and run the Customer Support Resolution Flow for each of them.

1. **Foreach Item:** For each ticket in `pendingTickets`, assign it as `ticketId` and run the workflow `customer-support-resolution-flow`.

# REQUIRED INPUTS
- `pendingTickets`: The list of pending ticket IDs.

# EXPECTED OUTPUTS
- `loopResults`: A summary of the execution results for the batch.
