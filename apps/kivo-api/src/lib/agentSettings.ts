export function getAgentLlmSettings(isLeader: boolean) {
  if (isLeader) {
    return {
      llmProvider: process.env.LEADER_AGENT_PROVIDER || "openai",
      llmModel: process.env.LEADER_AGENT_MODEL || "gpt-5.5",
      llmApiKey: process.env.LEADER_AGENT_API_KEY || "",
    };
  } else {
    return {
      llmProvider: process.env.AGENT_PROVIDER || "openai",
      llmModel: process.env.AGENT_MODEL || "gpt-5.4-mini",
      llmApiKey: process.env.AGENT_API_KEY || "",
    };
  }
}
