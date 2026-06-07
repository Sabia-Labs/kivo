---
id: gather-support-information
name: Gather Support Information
type: task
assigned_agent: support-analyst
---

# INSTRUCTIONS
Deep dive into internal knowledge bases to find technical solutions or past precedents.

1. **Search KB:** Use `knowledge_base.search` using the ticket context.
2. **Filter & Synthesize:** Curate only the relevant SOPs or past resolutions. 
3. **Technical Brief:** Prepare a summary of findings that the responder can use to draft the final answer.

# REQUIRED INPUTS
- `ticketId`: The identifier for the current case.
- `customerRequest`: The summary of the user's issue.

# EXPECTED OUTPUTS
- `supportSummary`: A technical synthesis of findings, documentation links, and suggested solutions.
- `documents`: A list of the specific resources consulted.
