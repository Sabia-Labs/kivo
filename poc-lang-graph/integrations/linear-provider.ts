import { getLinearMcpClient } from "../mcp-client";

export class LinearProvider {
  private static instance: LinearProvider | null = null;

  private constructor() {}

  public static getInstance(): LinearProvider {
    if (!LinearProvider.instance) {
      LinearProvider.instance = new LinearProvider();
    }
    return LinearProvider.instance;
  }

  public async callTool(toolName: string, args: Record<string, any>): Promise<string> {
    const client = await getLinearMcpClient();
    
    // Check available tools dynamically if we need to log them, but in a provider we just call them directly
    const response = await client.callTool({
      name: toolName,
      arguments: args
    });

    if (!response.content || !Array.isArray(response.content)) {
      throw new Error(`Invalid response format from Linear MCP tool: ${toolName}`);
    }

    const textContent = response.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    return textContent;
  }
}
