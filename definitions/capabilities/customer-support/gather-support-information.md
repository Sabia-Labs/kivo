---
id: gather-support-information
name: Gather Support Information
type: task_template
team_type: customer-support
featured: true
default_assigned_role: support-analyst
---

# INSTRUCTIONS
Deep dive into internal knowledge bases to find technical solutions or past precedents.

1. **Search KB:** Use `knowledge_base.search` to find relevant information. 
   - **CRITICAL:** The search engine is strict and relies heavily on exact title matches. 
   - Do NOT just search the entire customer request as one long sentence. 
   - If the first search returns empty, try 2 or 3 more searches using different, shorter keyword variations.
2. **Filter & Synthesize:** From all the content you could read from the knowledge base, curate only the relevant content, pages, articles, SOPs or previous resulotions.
3. **Technical Brief:** Prepare a summary of findings that the responder can use to draft the final answer.

# INPUTS
- `ticketId`: The identifier for the current case.
- `customerRequest`: The summary of the user's issue.

# EXPECTED OUTPUTS
- `supportSummary`: A technical synthesis of findings, documentation links, and suggested solutions.
- `documents`: A list of the specific resources consulted.
