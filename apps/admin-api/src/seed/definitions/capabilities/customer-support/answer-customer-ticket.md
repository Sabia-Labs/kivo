---
id: answer-customer-ticket
name_i18n_key: capabilities.customer_support.answer.name
description_i18n_key: capabilities.customer_support.answer.desc
type: task_template
team_type: customer-support
featured: true
default_assigned_role: support-responder
---

# INSTRUCTIONS
Provide a clear, helpful, and empathetic response to a specific customer inquiry.

1. **Context Discovery:** Review the customer's history and any previous related tickets.
2. **Solution Search:** Check the Knowledge Base and recently resolved Issues to find a solution.
3. **Drafting:** Write a response that acknowledges the user's frustration and provides a direct answer or next steps.
4. **Follow-up Action:** If the issue requires a technical fix, notify the Support Analyst. If resolved, ask the user for confirmation before closing.

# INPUTS
- Ticket content and User ID.

# EXPECTED OUTPUTS
- Link to the suggested or sent response.
- Status of the ticket after the action.
