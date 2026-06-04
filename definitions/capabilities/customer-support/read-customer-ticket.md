---
id: read-customer-ticket
name: Read Customer Ticket
type: task_template
team_type: customer-support
featured: true
default_assigned_role: support-responder
---

# INSTRUCTIONS
Connect to the ticketing system, retrieve the specified ticket, and analyze its content.

1. **Fetch Data:** Use `ticketing.get_details` with the provided ID.
2. **Contextual Analysis:** Understand the customer's core problem, sentiment, and urgency based on the company's global policies.
3. **Synthesis:** Draft a clean summary of the request for the next agents in the flow.

# INPUTS
- `ticketId`: The unique identifier of the ticket in the support tool.

# EXPECTED OUTPUTS
- `customerName`: Full name of the requester.
- `issueType`: Category of the problem (e.g., Bug, Billing, Feature Request).
- `customerRequest`: A clear summary of what the customer is asking for.
- `issueContext`: Background information gathered from the ticket history.
- `customerSentiment`: Current emotional state of the customer.
