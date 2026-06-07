import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env files from the directory tree upwards to ensure local and root .env settings are respected
const loadEnv = () => {
  dotenv.config();
  let dir = __dirname;
  const envFiles: string[] = [];
  while (dir && dir !== path.parse(dir).root) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      envFiles.push(envPath);
    }
    dir = path.dirname(dir);
  }
  envFiles.reverse().forEach(filePath => {
    dotenv.config({ path: filePath });
  });
};
loadEnv();

const mcpClients = new Map<string, Client>();
const mcpTransports = new Map<string, StdioClientTransport>();

export async function getLinearMcpClient(apiKey?: string): Promise<Client> {
  const token = apiKey || process.env.LINEAR_KEY;
  if (!token) {
    throw new Error("Linear API key (LINEAR_KEY) is not defined.");
  }

  if (mcpClients.has(token)) {
    return mcpClients.get(token)!;
  }

  // We instantiate StdioClientTransport to run the official Linear MCP server
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["--no-install", "@tacticlaunch/mcp-linear"],
    env: {
      LINEAR_API_KEY: token,
      PATH: process.env.PATH || "",
    }
  });

  const client = new Client(
    { name: "kivo-linear-client", version: "1.0.0" },
    { capabilities: {} }
  );

  console.log("\n\x1b[35m[MCP] Connecting to Linear MCP Server (Stdio) for key...\x1b[0m");
  await client.connect(transport, { timeout: 30000 });
  console.log("\x1b[35m[MCP] Connected to Linear MCP Server successfully!\x1b[0m");

  mcpClients.set(token, client);
  mcpTransports.set(token, transport);

  // Cleanup handler
  process.on("exit", async () => {
    await closeLinearMcpConnection(token);
  });

  return client;
}

export async function closeLinearMcpConnection(apiKey: string) {
  const client = mcpClients.get(apiKey);
  if (client) {
    console.log("\n\x1b[35m[MCP] Closing Linear MCP Connection...\x1b[0m");
    try {
      await client.close();
    } catch (e) {
      // Ignored
    }
    mcpClients.delete(apiKey);
    mcpTransports.delete(apiKey);
  }
}

export async function getNotionMcpClient(apiKey?: string): Promise<Client> {
  const token = apiKey || process.env.NOTION_ACCESS_TOKEN || process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error("Notion API token (NOTION_ACCESS_TOKEN) is not defined.");
  }

  const cacheKey = "notion_" + token;
  if (mcpClients.has(cacheKey)) {
    return mcpClients.get(cacheKey)!;
  }

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: {
      NOTION_API_TOKEN: token,
      NOTION_TOKEN: token,
      PATH: process.env.PATH || "",
    }
  });

  const client = new Client(
    { name: "kivo-notion-client", version: "1.0.0" },
    { capabilities: {} }
  );

  console.log("\n\x1b[35m[MCP] Connecting to Notion MCP Server (Stdio)...\x1b[0m");
  await client.connect(transport, { timeout: 30000 });
  console.log("\x1b[35m[MCP] Connected to Notion MCP Server successfully!\x1b[0m");

  mcpClients.set(cacheKey, client);
  mcpTransports.set(cacheKey, transport);

  // Cleanup handler
  process.on("exit", async () => {
    const c = mcpClients.get(cacheKey);
    if (c) {
      try { await c.close(); } catch {}
    }
  });

  return client;
}

export async function realNotionSearch(query: string, apiKey?: string) {
  const client = await getNotionMcpClient(apiKey);
  
  console.log(`\x1b[36m[MCP Call] Querying tools in Notion server...\x1b[0m`);
  const tools = await client.listTools();
  const toolNames = tools.tools.map(t => t.name);
  
  const targetTool = toolNames.find(name => name.toLowerCase().includes("search")) || "search";

  console.log(`\x1b[36m[MCP Call] Invoking tool "${targetTool}" for Notion with query: "${query}"...\x1b[0m`);
  
  const response = await client.callTool({
    name: targetTool,
    arguments: { query: query }
  });

  if (!response.content || !Array.isArray(response.content)) {
    throw new Error("Invalid response format from Notion MCP server.");
  }

  const searchJsonStr = response.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");

  let parsedResults;
  try {
    parsedResults = JSON.parse(searchJsonStr);
  } catch (e) {
    return [searchJsonStr]; // Fallback if not JSON
  }

  if (!parsedResults.results || parsedResults.results.length === 0) {
    return ["No results found."];
  }

  // Get the top 2 pages
  const pages = parsedResults.results.slice(0, 2);
  let finalContent = "";

  for (const page of pages) {
    if (page.object !== "page") continue;
    
    // Extract title if available
    const titleObj = page.properties?.title?.title?.[0] || page.properties?.Name?.title?.[0];
    const pageTitle = titleObj?.plain_text || "Untitled";
    finalContent += `\n\n--- PAGE: ${pageTitle} (ID: ${page.id}) ---\n`;

    try {
      const blockTool = toolNames.find(name => name.toLowerCase().includes("block-children")) || "API-get-block-children";
      const blockRes = await client.callTool({
        name: blockTool,
        arguments: { block_id: page.id }
      });

      const blockContent = blockRes.content as any[];
      const blockJsonStr = blockContent
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
        
      const blockData = JSON.parse(blockJsonStr);
      if (blockData.results) {
        for (const block of blockData.results) {
          if (block.type === "paragraph" && block.paragraph.rich_text?.length > 0) {
            finalContent += block.paragraph.rich_text.map((rt: any) => rt.plain_text).join("") + "\n";
          } else if (block.type === "heading_1" && block.heading_1.rich_text?.length > 0) {
            finalContent += "# " + block.heading_1.rich_text.map((rt: any) => rt.plain_text).join("") + "\n";
          } else if (block.type === "heading_2" && block.heading_2.rich_text?.length > 0) {
            finalContent += "## " + block.heading_2.rich_text.map((rt: any) => rt.plain_text).join("") + "\n";
          } else if (block.type === "bulleted_list_item" && block.bulleted_list_item.rich_text?.length > 0) {
            finalContent += "- " + block.bulleted_list_item.rich_text.map((rt: any) => rt.plain_text).join("") + "\n";
          }
        }
      } else {
        finalContent += blockJsonStr;
      }
    } catch (e: any) {
      finalContent += `[Could not fetch page contents: ${e.message}]\n`;
    }
  }

  return [finalContent];
}

export async function realLinearGetTicket(issueId: string, apiKey?: string) {
  const client = await getLinearMcpClient(apiKey);

  console.log(`\x1b[36m[MCP Call] Querying tools in Linear server...\x1b[0m`);
  const tools = await client.listTools();
  const toolNames = tools.tools.map(t => t.name);
  console.log(`\x1b[35m[MCP Tools] Available: ${toolNames.join(", ")}\x1b[0m`);

  // Dynamically find a tool containing 'getissue' case and separator-agnostically (matches get_issue, get-issue, getIssueById, etc.)
  // We prioritize 'byid' or make sure it is not the plural 'getissues' to avoid picking the list issues tool.
  const targetTool = toolNames.find(name => {
    const cleanName = name.toLowerCase().replace(/_|-/g, "");
    return cleanName.includes("getissuebyid") || (cleanName.includes("getissue") && !cleanName.includes("getissues"));
  }) || "linear_getIssueById";
  console.log(`\x1b[36m[MCP Call] Invoking tool "${targetTool}" for issue "${issueId}"...\x1b[0m`);

  const response = await client.callTool({
    name: targetTool,
    arguments: {
      id: issueId,
      issueId: issueId
    }
  });

  // Parse the tool content output
  if (!response.content || !Array.isArray(response.content)) {
    throw new Error("Invalid response format from Linear MCP server.");
  }

  const textContent = response.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");

  console.log(`\x1b[32m[MCP Output] Received data:\n${textContent.substring(0, 300)}...\x1b[0m`);

  return {
    rawIssueText: textContent
  };
}

export async function realLinearAddComment(issueId: string, body: string, apiKey?: string) {
  const client = await getLinearMcpClient(apiKey);

  console.log(`\x1b[36m[MCP Call] Querying tools in Linear server for comment creation...\x1b[0m`);
  const tools = await client.listTools();
  const toolNames = tools.tools.map(t => t.name);

  // Dynamically find a tool containing 'createcomment' case and separator-agnostically
  const targetTool = toolNames.find(name => {
    const cleanName = name.toLowerCase().replace(/_|-/g, "");
    return cleanName.includes("createcomment");
  }) || "linear_createComment";
  console.log(`\x1b[36m[MCP Call] Invoking tool "${targetTool}" for issue "${issueId}"...\x1b[0m`);

  const response = await client.callTool({
    name: targetTool,
    arguments: {
      issueId: issueId,
      body: body
    }
  });

  if (!response.content || !Array.isArray(response.content)) {
    throw new Error("Invalid response format from Linear MCP server.");
  }

  const textContent = response.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");

  console.log(`\x1b[32m[MCP Output] Received data:\n${textContent.substring(0, 300)}...\x1b[0m`);

  return {
    rawCommentResponse: textContent
  };
}

export async function realLinearSearchIssues(projectId: string, states?: string[], apiKey?: string) {
  const client = await getLinearMcpClient(apiKey);

  console.log(`\x1b[36m[MCP Call] Invoking linear_getProjectIssues for project "${projectId}"...\x1b[0m`);
  const response = await client.callTool({
    name: "linear_getProjectIssues",
    arguments: {
      projectId: projectId,
      states: states || ["Backlog"]
    }
  });

  if (!response.content || !Array.isArray(response.content)) {
    throw new Error("Invalid response format from Linear MCP server.");
  }

  const textContent = response.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");

  return {
    rawIssuesText: textContent
  };
}

export async function realLinearUpdateIssue(issueId: string, stateId: string, apiKey?: string) {
  const client = await getLinearMcpClient(apiKey);

  console.log(`\x1b[36m[MCP Call] Invoking linear_updateIssue for issue "${issueId}" with stateId "${stateId}"...\x1b[0m`);
  const response = await client.callTool({
    name: "linear_updateIssue",
    arguments: {
      id: issueId,
      stateId: stateId
    }
  });

  if (!response.content || !Array.isArray(response.content)) {
    throw new Error("Invalid response format from Linear MCP server.");
  }

  const textContent = response.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");

  return {
    rawUpdateResponse: textContent
  };
}
