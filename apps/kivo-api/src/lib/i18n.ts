type TranslationKey =
  | "integrationMissing"
  | "hitlComment"
  | "stepFailedNotificationTitle"
  | "stepFailedNotificationContent"
  | "taskCompletedSuccess"
  | "taskCompletedSuccessDefaultResult"
  | "requestFailed"
  | "requestCompleted"
  | "requestCompletedContent"
  | "taskRequiresApproval"
  | "approvalRequiredContent"
  | "operatorRetryComment"
  | "retryAgentReply"
  | "retryRequestStateEntry"
  | "bypassTaskResult"
  | "bypassAgentReply"
  | "bypassRequestStateEntry"
  | "cancelRequestStateEntry"
  | "cancelAgentReply"
  | "workflowExecutionError"
  | "otherTeamRoutingResponse";

const translations: Record<TranslationKey, { en: string; pt: string; zh: string }> = {
  integrationMissing: {
    en: "Tool '{tool}' is required for this task, but its corresponding integration is not configured for this team. Please connect the integration in the team settings.",
    pt: "A ferramenta '{tool}' é necessária para esta tarefa, mas a sua integração correspondente não está configurada para este time. Por favor, conecte a integração nas configurações do time.",
    zh: "此任务需要工具 '{tool}'，但该团队尚未配置相应的集成。请在团队设置中连接该集成。"
  },
  hitlComment: {
    en: "I tried to execute the step **{title}** but unfortunately it failed.\n**Reason:** {reason}\n\nHow should we proceed?",
    pt: "Tentei executar a etapa **{title}** mas infelizmente ela falhou.\n**Motivo:** {reason}\n\nComo devemos proceder?",
    zh: "我尝试执行步骤 **{title}**，但遗憾的是执行失败了。\n**原因：** {reason}\n\n我们接下来该如何处理？"
  },
  stepFailedNotificationTitle: {
    en: "Step Failed in Request Workflow",
    pt: "Falha na etapa do fluxo de requisição",
    zh: "请求工作流中步骤失败"
  },
  stepFailedNotificationContent: {
    en: "Step \"{title}\" in Request {identifier} failed: {reason}",
    pt: "A etapa \"{title}\" na Requisição {identifier} falhou: {reason}",
    zh: "请求 {identifier} 中的步骤 \"{title}\" 失败：{reason}"
  },
  taskCompletedSuccess: {
    en: "Task '{title}' completed successfully. Result: {result}",
    pt: "A tarefa '{title}' foi concluída com sucesso. Resultado: {result}",
    zh: "任务 '{title}' 已成功完成。结果：{result}"
  },
  taskCompletedSuccessDefaultResult: {
    en: "No result provided.",
    pt: "Nenhum resultado fornecido.",
    zh: "未提供结果。"
  },
  requestFailed: {
    en: "Request Failed",
    pt: "Requisição falhou",
    zh: "请求失败"
  },
  requestCompleted: {
    en: "Request Completed",
    pt: "Requisição concluída",
    zh: "请求已完成"
  },
  requestCompletedContent: {
    en: "Request {identifier} has been completed with status: {status}.",
    pt: "A Requisição {identifier} foi concluída com o status: {status}.",
    zh: "请求 {identifier} 已完成，状态为：{status}。"
  },
  taskRequiresApproval: {
    en: "Task Requires Human Approval",
    pt: "Tarefa requer aprovação humana",
    zh: "任务需要人工审批"
  },
  approvalRequiredContent: {
    en: "Approval required for task: {title}",
    pt: "Aprovação necessária para a tarefa: {title}",
    zh: "任务需要审批：{title}"
  },
  operatorRetryComment: {
    en: "Operator requested a retry. Additional instructions applied: {instructions}",
    pt: "Operador solicitou uma nova tentativa. Instruções adicionais aplicadas: {instructions}",
    zh: "操作员请求重试。已应用附加指令：{instructions}"
  },
  retryAgentReply: {
    en: "I have received your new instructions and will retry executing the step **{title}** right away!\n\n**Additional Instructions Applied:**\n{instructions}",
    pt: "Recebi suas novas instruções e vou tentar executar a etapa **{title}** novamente agora mesmo!\n\n**Instruções adicionais aplicadas:**\n{instructions}",
    zh: "我已收到您的新指令，将立即重试执行步骤 **{title}**！\n\n**已应用的附加指令：**\n{instructions}"
  },
  retryRequestStateEntry: {
    en: "Operator requested a retry on failed task '{title}'. Human Comment: \"{comment}\". Summarized Instructions Applied: \"{instructions}\"",
    pt: "Operador solicitou uma nova tentativa na tarefa falhada '{title}'. Comentário do usuário: \"{comment}\". Instruções adicionais resumidas aplicadas: \"{instructions}\"",
    zh: "操作员请求对失败的任务 '{title}' 进行重试。人工批注：\"{comment}\"。已应用的摘要指令：\"{instructions}\""
  },
  bypassTaskResult: {
    en: "Bypassed by human operator instructions.",
    pt: "Ignorado por instruções do operador humano.",
    zh: "已由人工操作员指令跳过。"
  },
  bypassAgentReply: {
    en: "Understood. Bypassing the failed step **{title}** and proceeding to the next task in the workflow.",
    pt: "Entendido. Ignorando a etapa falhada **{title}** e prosseguindo para a próxima tarefa no fluxo de trabalho.",
    zh: "明白。已跳过失败步骤 **{title}** 并继续执行工作流中的下一项任务。"
  },
  bypassRequestStateEntry: {
    en: "Operator requested a bypass on failed task '{title}'. Human Comment: \"{comment}\". Task was skipped by operator instructions.",
    pt: "Operador solicitou ignorar a tarefa falhada '{title}'. Comentário do usuário: \"{comment}\". A tarefa foi pulada por instruções do operador.",
    zh: "操作员请求跳过失败的任务 '{title}'。人工批注：\"{comment}\"。根据操作员指令已跳过该任务。"
  },
  cancelRequestStateEntry: {
    en: "Operator requested a cancellation of the request workflow on task '{title}'. Human Comment: \"{comment}\".",
    pt: "Operador solicitou o cancelamento do fluxo de trabalho na tarefa '{title}'. Comentário do usuário: \"{comment}\".",
    zh: "操作员请求取消任务 '{title}' 处的请求工作流。人工批注：\"{comment}\"。"
  },
  cancelAgentReply: {
    en: "Understood. I have cancelled the request workflow as requested.",
    pt: "Entendido. Cancelei o fluxo de trabalho da requisição como solicitado.",
    zh: "明白。我已根据要求取消了请求工作流。"
  },
  workflowExecutionError: {
    en: "Error executing task: {reason}",
    pt: "Erro ao executar a tarefa: {reason}",
    zh: "执行任务时出错：{reason}"
  },
  otherTeamRoutingResponse: {
    en: "This request is better suited for another team: {otherTeam}. Please direct your request to them.",
    pt: "Esta requisição é mais adequada para outra equipe: {otherTeam}. Por favor, envie sua requisição para eles.",
    zh: "此请求更适合另一个团队：{otherTeam}。请向他们发送您的请求。"
  }
};

/**
 * Detects the language (Portuguese or English) of a given request details text.
 */
export function detectLanguage(text?: string | null): "pt" | "en" {
  if (!text) return "en";
  const ptRegex = /[áàâãéêíóôõúç]/i;
  const commonPtWords = /\b(por\s+favor|ler|ticket|erro|falha|com|para|como|está|tarefa|o|a|e|do|da|no|na|me|ver|olhar|ajudar|ajuda|pode|prosseguir|sim|nao|não|olá|ola|obrigado|obrigada|favor|por|leia|resumo|resumir|saber|detalhes|este|esta|isto)\b/i;
  if (ptRegex.test(text) || commonPtWords.test(text)) {
    return "pt";
  }
  return "en";
}

/**
 * Translates a key based on the detected or specified language, replacing placeholders.
 */
export function t(key: TranslationKey, lang: "pt" | "en" | "zh", params?: Record<string, string>): string {
  const resolvedLang = lang || "en";
  const template = translations[key]?.[resolvedLang] || translations[key]?.["en"] || "";
  if (!params) return template;

  let result = template;
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(new RegExp(`{${k}}`, "g"), v);
  }
  return result;
}

/**
 * Queries the database to retrieve the language configured for the workspace of a given team.
 */
export async function resolveWorkspaceLanguage(teamId: string): Promise<"en" | "pt" | "zh"> {
  try {
    const { db } = await import("../db/client");
    const { teams, workspaces } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");

    const [teamRecord] = await db
      .select({ workspaceId: teams.workspaceId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (teamRecord?.workspaceId) {
      const [workspaceRecord] = await db
        .select({ language: workspaces.language })
        .from(workspaces)
        .where(eq(workspaces.id, teamRecord.workspaceId))
        .limit(1);

      if (workspaceRecord?.language === "pt" || workspaceRecord?.language === "zh") {
        return workspaceRecord.language as any;
      }
    }
  } catch (err) {
    console.error("[i18n] Failed to resolve workspace language, defaulting to en:", err);
  }
  return "en";
}
