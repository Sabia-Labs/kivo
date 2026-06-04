---
id: answer-customer-ticket
name: Answer Customer Ticket
type: task
assigned_agent: support-responder
---

# INSTRUCTIONS
Draft a warm, personal, and highly empathetic email response to the customer. 
You MUST write the final email draft in the main markdown body (after the closing '---' of the YAML block).

Follow these exact requirements:
1. **Greeting:** Start with a warm greeting addressing the customer by their first name (e.g., "Hello <customerName>,").
2. **Empathy & Apology:** Express deep empathy for the issue. Acknowledge that the live map lag is severely impacting their delivery SLAs and apologize sincerely for this disruption.
3. **Actionable Resolution:** Translate the technical solution (expired secret JWT tokens requiring a reset of API tokens in settings and environment variables) into a warm, polite, step-by-step guide that the customer can follow.
4. **Closing & Signature:** Offer to help further if they have any questions, and sign off warmly as "Feliciano" from the "AcmeFlow Customer Support" team.

Do NOT include any mechanical tables or raw JSON. Write a real, natural, and polite customer email.


# REQUIRED INPUTS
- `ticketId`: The identifier for the current case.
- `customerName`: Recipient's name.
- `customerRequest`: The original inquiry context.
- `supportSummary`: The technical resolution found.
- `humanFeedback` (optional): Previous revision comments from a human operator.

# EXPECTED OUTPUTS
- `responseDraft`: The full text of the message to be sent.
