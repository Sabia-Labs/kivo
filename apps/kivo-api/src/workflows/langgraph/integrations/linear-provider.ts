import { getLinearMcpClient } from "../mcp-client";

export class LinearProvider {
  private static instances = new Map<string, LinearProvider>();

  private constructor(private apiKey: string) {}

  public static getInstance(apiKey: string): LinearProvider {
    if (!apiKey) {
      throw new Error("Linear API key is required to instantiate LinearProvider.");
    }
    if (!LinearProvider.instances.has(apiKey)) {
      LinearProvider.instances.set(apiKey, new LinearProvider(apiKey));
    }
    return LinearProvider.instances.get(apiKey)!;
  }

  public async callTool(toolName: string, args: Record<string, any>): Promise<string> {
    const client = await getLinearMcpClient(this.apiKey);
    
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

  public getApiKey(): string {
    return this.apiKey;
  }
}
