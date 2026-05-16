---
name: notion
description: Manage Notion pages, databases, blocks, and search natively via MCP.
metadata: { "openclaw": { "emoji": "📓" } }
---

# Notion Skill

You have full access to the Notion workspace through a dedicated MCP server. This allows you to create, read, and search for documents, tasks, and project data stored in Notion.

## Available Tools:

- **Search**: Find pages or databases by title.
- **Append Block**: Add content (text, to-dos, etc.) to existing pages.
- **Create Page**: Create new pages inside existing databases or under parent pages.
- **Get Database**: Retrieve structure and entries of a database.
- **Get Page**: Read the content and properties of a specific page.
- **List Databases**: Find all databases you have access to.

## Best Practices

1. **Search First**: Before creating or updating, use `search` to find the correct `page_id` or `database_id`.
2. **Contextual Updates**: When a user asks to "save this to Notion", ask which page or database if you find multiple matches.
3. **Structuring Data**: When creating pages in databases, ensure you provide the properties required by that database schema.
4. **Rich Content**: You can use Markdown-like structures which the MCP server will translate into Notion blocks.

## Example Workflows

### Creating a Task
1. Search for a database named "Tasks" or "To-do".
2. Use `create_page` with the `database_id` and the task details in `properties`.

### Meeting Notes
1. Search for a "Meeting Notes" page.
2. Use `append_block` to add the summary of the current conversation.
