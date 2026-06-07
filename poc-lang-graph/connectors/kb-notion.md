---
provider: notion
interface: IKnowledgeBase
---
# Connector: Knowledge Base (Notion Integration)
**Provider:** Notion (Mock)
**Purpose:** Search internal documentation, standard operating procedures (SOPs), and historical case resolutions.

## Actions

### `knowledge_base.search`
- **MCP Tool:** `googleDriveSearch` (Engine Mock mapped to Notion concept)
- **Description:** Performs a semantic search across the company's internal wiki and past tickets to find troubleshooting guides or lessons learned.
- **Required Parameters:**
  - `query`: The search string, keywords, or the ticket ID to find related historical data.
