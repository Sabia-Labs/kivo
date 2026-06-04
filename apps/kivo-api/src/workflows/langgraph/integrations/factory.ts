import * as fs from "fs";
import * as path from "path";
import { IConnectorAdapter } from "./interfaces";
import { LinearProvider } from "./linear-provider";
import { LinearTicketingAdapter, LinearProjectManagerAdapter } from "./linear-adapters";
import { realNotionSearch } from "../mcp-client";

export function parseConnectorFrontmatter(markdown: string): { frontmatter: Record<string, any>; content: string } {
  const parts = markdown.split(/---/);
  
  if (parts.length >= 3) {
    const yamlText = parts[1];
    const content = parts.slice(2).join("---").trim();
    
    const lines = yamlText.split("\n");
    const stack: { indent: number; obj: Record<string, any> }[] = [];
    const root: Record<string, any> = {};
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const indent = line.search(/\S/);
      const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*:\s*(.*)$/);
      
      if (match) {
        const key = match[1].trim().replace(/^['"]|['"]$/g, "");
        const val = match[2].trim().replace(/^['"]|['"]$/g, "");

        // Pop from stack until we find the parent indentation level
        while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
          stack.pop();
        }

        const currentObj = stack.length > 0 ? stack[stack.length - 1].obj : root;

        if (val === "" || val === "|") {
          const newObj = {};
          currentObj[key] = newObj;
          stack.push({ indent, obj: newObj });
        } else {
          if (val.startsWith("[") && val.endsWith("]")) {
            try {
              currentObj[key] = JSON.parse(val.replace(/'/g, '"'));
            } catch {
              currentObj[key] = val;
            }
          } else {
            currentObj[key] = val;
          }
        }
      }
    });

    return { frontmatter: root, content };
  }

  return { frontmatter: {}, content: markdown };
}

export class ConnectorFactory {
  public static createAdapter(providerName: string, config: any = {}): IConnectorAdapter | null {
    console.log(`\x1b[35m[ConnectorFactory] Instantiating adapter for provider "${providerName}"...\x1b[0m`);

    providerName = providerName.toLowerCase();

    if (providerName === "linear") {
      const provider = LinearProvider.getInstance(config.apiKey);
      return new LinearTicketingAdapter(provider, config);
    } else if (providerName === "notion") {
      return {
        interfaceType: "IKnowledgeBase",
        async search(query: string) {
          try {
            return await realNotionSearch(query, config.apiKey);
          } catch (err: any) {
            console.error(`\x1b[31m[NotionKnowledgeBaseAdapter] Error: ${err.message}\x1b[0m`);
            return [];
          }
        }
      } as any;
    }

    console.log(`\x1b[31m[ConnectorFactory] Provider "${providerName}" not registered.\x1b[0m`);
    return null;
  }
}
