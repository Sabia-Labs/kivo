import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env variables
dotenv.config({ path: path.join(__dirname, ".env") });

let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;

export async function getLinearMcpClient(): Promise<Client> {
  if (mcpClient) return mcpClient;

  const apiKey = process.env.LINEAR_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_KEY is not defined in the .env file.");
  }

  // We instantiate StdioClientTransport to run the official Linear MCP server
  mcpTransport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@tacticlaunch/mcp-linear"],
    env: {
      LINEAR_API_KEY: apiKey,
      PATH: process.env.PATH || ""
    }
  });

  const client = new Client(
    { name: "kivo-linear-client", version: "1.0.0" },
    { capabilities: {} }
  );

  console.log("\n\x1b[35m[MCP] Connecting to Linear MCP Server (Stdio)...\x1b[0m");
  await client.connect(mcpTransport);
  console.log("\x1b[35m[MCP] Connected to Linear MCP Server successfully!\x1b[0m");

  mcpClient = client;

  // Cleanup handler
  process.on("exit", async () => {
    await closeLinearMcpConnection();
  });

  return client;
}

export async function closeLinearMcpConnection() {
  if (mcpClient) {
    console.log("\n\x1b[35m[MCP] Closing Linear MCP Connection...\x1b[0m");
    try {
      await mcpClient.close();
    } catch (e) {
      // Ignored
    }
    mcpClient = null;
  }
}

export async function realLinearGetTicket(issueId: string) {
  const client = await getLinearMcpClient();

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

export async function realLinearAddComment(issueId: string, body: string) {
  const client = await getLinearMcpClient();

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

export async function realLinearSearchIssues(projectId: string, states?: string[]) {
  const client = await getLinearMcpClient();

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

export async function realLinearUpdateIssue(issueId: string, stateId: string) {
  const client = await getLinearMcpClient();

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
