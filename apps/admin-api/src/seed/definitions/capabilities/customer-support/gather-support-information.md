---
id: gather-support-information
name: Gather Support Information
name_i18n_key: capabilities.customer_support.gather.name
description_i18n_key: capabilities.customer_support.gather.desc
type: task_template
team_type: customer-support
featured: true
default_assigned_role: support-analyst
---

# INSTRUCTIONS
Connect to the team's documentation tool via MCP, perform deep searches related to the ticket, filter duplicate content, and synthesize a comprehensive summary of relevant knowledge base articles, similar past tickets, and lessons learned.

1. **Identify Documentation Source:** Verify the tool used by the team to store internal documentation, knowledge base articles, wiki pages, and historical tickets.
2. **Deep Search:** Connect to this tool using an MCP connection. Perform a deep search using the context of the provided ticket ID.
3. **Multi-Term Querying:** Search multiple times using different, related keywords and search terms to ensure comprehensive results.
4. **Content Filtering & De-duplication:** Ignore redundant or duplicate search results. Curate the most relevant information carefully.
5. **Synthesis & Summary:** Draft a synthesized summary of all compiled resources, including related documentation pages, knowledge base articles, similar past tickets, and lessons learned.

# INPUTS
- Ticket ID.

# EXPECTED OUTPUTS
- A curated and synthesized summary of all relevant documentation, similar tickets, articles, and lessons learned related to the ticket topic.
