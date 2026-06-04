export interface IConnectorAdapter {
  interfaceType: string;
}

export interface ITicketingSystem extends IConnectorAdapter {
  interfaceType: "ITicketingSystem";
  getTicketDetails(id: string): Promise<any>;
  addReply(id: string, body: string): Promise<any>;
  updateStatus(id: string, status: string): Promise<any>;
  searchTickets(projectId: string, states: string[]): Promise<any>;
}

export interface IProjectManager extends IConnectorAdapter {
  interfaceType: "IProjectManager";
  getTaskDetails(id: string): Promise<any>;
  addComment(id: string, text: string): Promise<any>;
  updateTaskState(id: string, state: string): Promise<any>;
  listBacklog(projectId: string): Promise<any>;
}

export interface IKnowledgeBase extends IConnectorAdapter {
  interfaceType: "IKnowledgeBase";
  search(query: string): Promise<any>;
}
