import { ITicketingSystem, IProjectManager } from "./interfaces";
import { LinearProvider } from "./linear-provider";
import { getLinearMcpClient } from "../mcp-client";

export class LinearTicketingAdapter implements ITicketingSystem {
  public readonly interfaceType = "ITicketingSystem";

  constructor(
    private provider: LinearProvider,
    private config: { projectId: string; statusMapping: Record<string, string> }
  ) {}

  public async getTicketDetails(id: string): Promise<any> {
    const rawRes = await this.provider.callTool("linear_getIssueById", { id, issueId: id });
    try {
      return JSON.parse(rawRes);
    } catch {
      return { rawIssueText: rawRes };
    }
  }

  public async addReply(id: string, body: string): Promise<any> {
    const rawRes = await this.provider.callTool("linear_createComment", { issueId: id, body });
    try {
      return JSON.parse(rawRes);
    } catch {
      return { rawCommentResponse: rawRes };
    }
  }

  public async updateStatus(id: string, status: string): Promise<any> {
    let stateId = status;
    const lowerStatus = status.toLowerCase();
    
    // Look up status in mapping
    if (this.config.statusMapping && this.config.statusMapping[status]) {
      stateId = this.config.statusMapping[status];
    } else if (this.config.statusMapping && this.config.statusMapping[lowerStatus]) {
      stateId = this.config.statusMapping[lowerStatus];
    } else {
      // Hardcoded fallback for Customer Support state UUIDs in Linear
      if (lowerStatus === "in progress" || lowerStatus === "in_progress" || lowerStatus === "3") {
        stateId = "c68f978d-a708-4cd0-8bb8-055bb0ef7fc5";
      } else if (lowerStatus === "done" || lowerStatus === "completed" || lowerStatus === "4") {
        stateId = "fde11876-a60a-40e4-95b8-9c73be20a565";
      }
    }

    console.log(`\n\x1b[35m[LinearTicketingAdapter] Mapping status "${status}" to stateId "${stateId}"\x1b[0m`);
    const rawRes = await this.provider.callTool("linear_updateIssue", { id, stateId });
    try {
      return JSON.parse(rawRes);
    } catch {
      return { rawUpdateResponse: rawRes };
    }
  }

  public async searchTickets(projectId: string, states: string[]): Promise<any> {
    let resolvedProjectId = projectId || this.config.projectId || "Customer Support";

    // Dynamically resolve project name to UUID if not already a UUID
    if (resolvedProjectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedProjectId)) {
      console.log(`\n\x1b[35m[LinearTicketingAdapter] Resolving project name "${resolvedProjectId}" to UUID...\x1b[0m`);
      const client = await getLinearMcpClient();
      const res = await client.callTool({ name: "linear_getProjects", arguments: {} });
      if (res.content && Array.isArray(res.content)) {
        const text = res.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
        try {
          const projects = JSON.parse(text);
          const matched = projects.find((p: any) => p.name.toLowerCase() === resolvedProjectId.toLowerCase() || p.slug?.toLowerCase() === resolvedProjectId.toLowerCase());
          if (matched) {
            console.log(`\x1b[32m[LinearTicketingAdapter] Resolved "${resolvedProjectId}" -> "${matched.id}" (${matched.name})\x1b[0m`);
            resolvedProjectId = matched.id;
          } else {
            console.log(`\x1b[31m[LinearTicketingAdapter] Failed to find project named "${resolvedProjectId}"\x1b[0m`);
          }
        } catch (err: any) {
          console.log(`\x1b[31m[LinearTicketingAdapter] Error parsing projects: ${err.message}\x1b[0m`);
        }
      }
    }

    const rawRes = await this.provider.callTool("linear_getProjectIssues", {
      projectId: resolvedProjectId,
      states: states || ["Backlog"]
    });

    try {
      return JSON.parse(rawRes);
    } catch {
      return { rawIssuesText: rawRes };
    }
  }
}

export class LinearProjectManagerAdapter implements IProjectManager {
  public readonly interfaceType = "IProjectManager";

  constructor(
    private provider: LinearProvider,
    private config: { projectId: string; statusMapping: Record<string, string> }
  ) {}

  public async getTaskDetails(id: string): Promise<any> {
    const rawRes = await this.provider.callTool("linear_getIssueById", { id, issueId: id });
    try {
      return JSON.parse(rawRes);
    } catch {
      return { rawIssueText: rawRes };
    }
  }

  public async addComment(id: string, text: string): Promise<any> {
    const rawRes = await this.provider.callTool("linear_createComment", { issueId: id, body: text });
    try {
      return JSON.parse(rawRes);
    } catch {
      return { rawCommentResponse: rawRes };
    }
  }

  public async updateTaskState(id: string, state: string): Promise<any> {
    let stateId = state;
    const lowerState = state.toLowerCase();

    if (this.config.statusMapping && this.config.statusMapping[state]) {
      stateId = this.config.statusMapping[state];
    } else if (this.config.statusMapping && this.config.statusMapping[lowerState]) {
      stateId = this.config.statusMapping[lowerState];
    }

    console.log(`\n\x1b[35m[LinearProjectManagerAdapter] Mapping state "${state}" to stateId "${stateId}"\x1b[0m`);
    const rawRes = await this.provider.callTool("linear_updateIssue", { id, stateId });
    try {
      return JSON.parse(rawRes);
    } catch {
      return { rawUpdateResponse: rawRes };
    }
  }

  public async listBacklog(projectId: string): Promise<any> {
    let resolvedProjectId = projectId || this.config.projectId;
    const rawRes = await this.provider.callTool("linear_getProjectIssues", {
      projectId: resolvedProjectId,
      states: ["Backlog", "Todo"]
    });

    try {
      return JSON.parse(rawRes);
    } catch {
      return { rawIssuesText: rawRes };
    }
  }
}
