---
id: send-customer-answer
name: Send Customer Answer
type: task_template
team_type: customer-support
featured: true
default_assigned_role: support-responder
---

# INSTRUCTIONS
Connect to the team's external ticket system via MCP, locate the specified customer ticket, write/submit the drafted answer, and update the ticket status.

1. **Identify External Ticket System:** Verify which tool the team is using as the source for customer tickets (e.g., Zendesk, Intercom, HubSpot, Jira Service Desk, etc.).
2. **Establish MCP Connection:** Connect to this ticket system using an MCP connection.
3. **Locate Ticket:** Find the ticket corresponding to the provided Ticket ID.
4. **Submit Customer Answer:** Write the drafted response to the ticket. Ensure that the answer is posted as a public response so it is sent directly to the customer.
5. **Update Ticket Status:** Set the ticket status to the appropriate value (e.g. "Pending User Response" or "Resolved" depending on the draft context).

# INPUTS
- Ticket ID.
- Drafted response text.

# EXPECTED OUTPUTS
- A confirmation of the successful submission and the updated status of the ticket in the external system.
