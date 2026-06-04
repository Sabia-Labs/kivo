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

const translations: Record<TranslationKey, { en: string; pt: string }> = {
  integrationMissing: {
    en: "Tool '{tool}' is required for this task, but its corresponding integration is not configured for this team. Please connect the integration in the team settings.",
    pt: "A ferramenta '{tool}' é necessária para esta tarefa, mas a sua integração correspondente não está configurada para este time. Por favor, conecte a integração nas configurações do time."
  },
  hitlComment: {
    en: "I tried to execute the step **{title}** but unfortunately it failed.\n**Reason:** {reason}\n\nHow should we proceed?",
    pt: "Tentei executar a etapa **{title}** mas infelizmente ela falhou.\n**Motivo:** {reason}\n\nComo devemos proceder?"
  },
  stepFailedNotificationTitle: {
    en: "Step Failed in Request Workflow",
    pt: "Falha na etapa do fluxo de requisição"
  },
  stepFailedNotificationContent: {
    en: "Step \"{title}\" in Request {identifier} failed: {reason}",
    pt: "A etapa \"{title}\" na Requisição {identifier} falhou: {reason}"
  },
  taskCompletedSuccess: {
    en: "Task '{title}' completed successfully. Result: {result}",
    pt: "A tarefa '{title}' foi concluída com sucesso. Resultado: {result}"
  },
  taskCompletedSuccessDefaultResult: {
    en: "No result provided.",
    pt: "Nenhum resultado fornecido."
  },
  requestFailed: {
    en: "Request Failed",
    pt: "Requisição falhou"
  },
  requestCompleted: {
    en: "Request Completed",
    pt: "Requisição concluída"
  },
  requestCompletedContent: {
    en: "Request {identifier} has been completed with status: {status}.",
    pt: "A Requisição {identifier} foi concluída com o status: {status}."
  },
  taskRequiresApproval: {
    en: "Task Requires Human Approval",
    pt: "Tarefa requer aprovação humana"
  },
  approvalRequiredContent: {
    en: "Approval required for task: {title}",
    pt: "Aprovação necessária para a tarefa: {title}"
  },
  operatorRetryComment: {
    en: "Operator requested a retry. Additional instructions applied: {instructions}",
    pt: "Operador solicitou uma nova tentativa. Instruções adicionais aplicadas: {instructions}"
  },
  retryAgentReply: {
    en: "I have received your new instructions and will retry executing the step **{title}** right away!\n\n**Additional Instructions Applied:**\n{instructions}",
    pt: "Recebi suas novas instruções e vou tentar executar a etapa **{title}** novamente agora mesmo!\n\n**Instruções adicionais aplicadas:**\n{instructions}"
  },
  retryRequestStateEntry: {
    en: "Operator requested a retry on failed task '{title}'. Human Comment: \"{comment}\". Summarized Instructions Applied: \"{instructions}\"",
    pt: "Operador solicitou uma nova tentativa na tarefa falhada '{title}'. Comentário do usuário: \"{comment}\". Instruções adicionais resumidas aplicadas: \"{instructions}\""
  },
  bypassTaskResult: {
    en: "Bypassed by human operator instructions.",
    pt: "Ignorado por instruções do operador humano."
  },
  bypassAgentReply: {
    en: "Understood. Bypassing the failed step **{title}** and proceeding to the next task in the workflow.",
    pt: "Entendido. Ignorando a etapa falhada **{title}** e prosseguindo para a próxima tarefa no fluxo de trabalho."
  },
  bypassRequestStateEntry: {
    en: "Operator requested a bypass on failed task '{title}'. Human Comment: \"{comment}\". Task was skipped by operator instructions.",
    pt: "Operador solicitou ignorar a tarefa falhada '{title}'. Comentário do usuário: \"{comment}\". A tarefa foi pulada por instruções do operador."
  },
  cancelRequestStateEntry: {
    en: "Operator requested a cancellation of the request workflow on task '{title}'. Human Comment: \"{comment}\".",
    pt: "Operador solicitou o cancelamento do fluxo de trabalho na tarefa '{title}'. Comentário do usuário: \"{comment}\"."
  },
  cancelAgentReply: {
    en: "Understood. I have cancelled the request workflow as requested.",
    pt: "Entendido. Cancelei o fluxo de trabalho da requisição como solicitado."
  },
  workflowExecutionError: {
    en: "Error executing task: {reason}",
    pt: "Erro ao executar a tarefa: {reason}"
  },
  otherTeamRoutingResponse: {
    en: "This request is better suited for another team: {otherTeam}. Please direct your request to them.",
    pt: "Esta requisição é mais adequada para outra equipe: {otherTeam}. Por favor, envie sua requisição para eles."
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
  const resolvedLang = lang === "zh" ? "en" : lang;
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
