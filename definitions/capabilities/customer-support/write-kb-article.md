---
id: write-kb-article
name: Write KB Article
type: task_template
team_type: customer-support
featured: false
default_assigned_role: support-analyst
---

# INSTRUCTIONS
Connect to the team's documentation/KB tool via MCP, review the source tickets or topics, identify key patterns, draft a comprehensive, step-by-step Knowledge Base article, and publish/save it.

1. **Identify the KB/Documentation Tool:** Verify the tool used by the team to store internal documentation and knowledge base articles (e.g. Notion, Confluence, GitHub wiki) and connect to it using an MCP connection.
2. **Analyze Source Tickets or Topics:** Review the provided input tickets or topic details. Use MCP to retrieve ticket context, examine historical conversations, identify the core problem/question, and trace the successful resolution or workaround.
3. **Verify Existing Coverage:** Perform a search in the KB tool using related keywords to check if a relevant article already exists. If one exists, plan to update and expand it instead of creating a duplicate.
4. **Draft the KB Article:** Write a structured, high-quality, and user-friendly document including:
   - **Title:** A clear, search-friendly headline (e.g., "How to resolve [Issue]" or "Troubleshooting [Topic]").
   - **Objective/Overview:** A brief summary explaining what the article covers and who it is for.
   - **Prerequisites/Context:** Any environment variables, permissions, or system states required.
   - **Step-by-Step Instructions:** Clear, logical, and numbered instructions to resolve the problem. Use simple language, bold key elements, and suggest placeholders for screenshots where appropriate.
   - **Alternative Paths/Troubleshooting:** A section covering common edge cases, error messages, or fallback solutions.
   - **References:** Cross-reference the source ticket IDs or related documentation pages.
5. **Publish or Save Draft:** Connect to the KB/documentation tool via MCP to create the new article or update the existing one.
6. **Provide Output Link:** Retrieve and return the exact URL, document ID, or access path to the published or drafted article.

# INPUTS
- Topic, ticket ID, or a list of related tickets.

# EXPECTED OUTPUTS
- A detailed, step-by-step Knowledge Base article drafted or published in the team's documentation tool, along with its reference link or document ID.
