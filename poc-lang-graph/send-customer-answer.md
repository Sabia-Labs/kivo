---
id: send-customer-answer
name: Send Customer Answer
type: task
assigned_agent: support-responder
---

# INSTRUCTIONS
Execute the final delivery and update the case status.

1. **Send:** Use `ticketing.add_public_reply` to post the approved `responseDraft`.
2. **Close/Update:** Use `ticketing.update_status` to move the ticket to 'In Progress'.


# REQUIRED INPUTS
- `ticketId`: The target ticket.
- `responseDraft`: The final approved message.

# EXPECTED OUTPUTS
- `isAnswered`: Boolean confirmation of delivery.
- `finalStatus`: The resulting state of the ticket.
