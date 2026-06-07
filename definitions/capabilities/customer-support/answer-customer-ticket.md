---
id: answer-customer-ticket
name: Answer Customer Ticket
type: task_template
team_type: customer-support
featured: true
default_assigned_role: support-responder
---

# INSTRUCTIONS
The objective is to draft a warm, professional, and highly empathetic email response to the customer. 
The final email draft must be written in the main markdown body (after the closing '---' of the YAML block).

Follow these exact requirements:
1. **Persona:** The response must be written strictly from the perspective of a Company Customer Support Representative. Under no circumstances should the text echo the customer's exact complaint as if it were the company's own words, nor should it be written from the customer's point of view.
2. **Greeting:** Start with a warm greeting addressing the customer by their name.
3. **Empathy & Apology:** Express deep empathy for their specific issue and apologize sincerely for the disruption it caused.
4. **Actionable Resolution:** Use the provided `supportSummary` to explain the technical resolution in a clear, polite, step-by-step manner that the customer can easily understand. Do not invent technical details that are not in the summary.
5. **Closing & Signature:** Offer further assistance if needed, and sign off warmly as the "Customer Support Team".

Do NOT include any mechanical tables or raw JSON. Write a real, natural, and polite customer email.


# INPUTS
- `ticketId`: The identifier for the current case.
- `customerName`: Recipient's name.
- `customerRequest`: The original inquiry context.
- `supportSummary`: The technical resolution found.
- `humanFeedback` (optional): Previous revision comments from a human operator.

# EXPECTED OUTPUTS
- `responseDraft`: The full text of the message to be sent.
