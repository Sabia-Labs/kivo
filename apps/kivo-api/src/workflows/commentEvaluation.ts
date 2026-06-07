import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { db } from "../db/client";
import { requests, tasks, comments, conversations, messages, agents, teams, workspaces } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";
import { runRequestContinuation } from "./requestContinuation";
import { updateRequest, addCommentToRequest } from "../controllers/requestsController";
import { LLMFactory } from "./langgraph/integrations/llm-factory";
import { t, resolveWorkspaceLanguage } from "../lib/i18n";

const IntentionSchema = z.object({
  intent: z.enum(["retry", "bypass", "cancel", "chat"]),
  extractedInstructions: z.string().describe("Concise summarization in English of the new instructions, parameters, corrections, or API keys provided by the human operator. Leave empty if intent is not retry."),
  reasoning: z.string().describe("Brief reasoning for the classification."),
});

function getLlm(): any {
  return LLMFactory.createModel("orchestrator");
}

export async function evaluateHumanComment(
  teamId: string,
  requestId: string,
  newCommentContent: string
) {
  try {
    // 1. Fetch Request
    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request || request.status !== "waiting_user") {
      return;
    }

    // 2. Fetch the most recent Task for this request
    const [lastTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.requestId, requestId))
      .orderBy(desc(tasks.createdAt))
      .limit(1);

    if (!lastTask || lastTask.status !== "failed") {
      return;
    }

    console.log(`[comment-evaluation] Evaluating human comment on request ${request.identifier} (Task: ${lastTask.title})...`);

    const llm = getLlm();
    const structuredLlm = llm.withStructuredOutput(IntentionSchema);

    const prompt = `You are an Intent Classifier Agent for Kivo, an autonomous Kubernetes AI developer platform.
A human operator has just commented on a request that has stopped because a task failed.

Your goal is to classify the human's intent and extract any new instructions.

### Request Context:
- Title: ${request.title}
- Description: ${request.requestDetails || "No details provided"}
- Current State: ${JSON.stringify(request.state)}

### Failed Task Context:
- Title: ${lastTask.title}
- Failure Reason: ${lastTask.failureReason}
- Original Instructions: ${lastTask.instructions}

### New Operator Comment:
"${newCommentContent}"

Classify the intent into one of these 4 values:
1. "retry": The operator wants to re-run the failed task, typically providing new details, solutions, corrections, API keys, credentials, or simply asking to try again (e.g., "try again", "try with a different input", "here is the correct credentials").
2. "bypass": The operator wants to skip the failed task and proceed to the next task in the workflow (e.g., "skip this step").
3. "cancel": The operator wants to abort/cancel the entire request (e.g., "cancel everything", "stop the flow", "abort it").
4. "chat": The operator is just talking, asking a question, saying thank you, saying hello, or making comments that do not imply a do-not-trigger action.`;

    const result = await structuredLlm.invoke(prompt);
    console.log(`[comment-evaluation] Classified intent: ${result.intent}. Reasoning: ${result.reasoning}`);

    const actorId = lastTask.assignedToId || teamId;
    const lang = await resolveWorkspaceLanguage(teamId);

    if (result.intent === "retry") {
      // 1. Update task instructions and reset status to open
      const updatedInstructions = `${lastTask.instructions || ""}\n\n[HUMAN OPERATOR RETRY CORRECTION]:\n${result.extractedInstructions}`;
      
      const [updatedTask] = await db.update(tasks).set({
        status: "open",
        instructions: updatedInstructions,
        failureReason: null,
        updatedAt: new Date()
      }).where(eq(tasks.id, lastTask.id)).returning();

      // 2. Add system comment on the Task itself
      await db.insert(comments).values({
        teamId,
        taskId: lastTask.id,
        actorId,
        actorType: "agent",
        content: t("operatorRetryComment", lang, { instructions: result.extractedInstructions })
      });

      // 3. Add acknowledgement comment on Request
      const replyContent = t("retryAgentReply", lang, {
        title: lastTask.title,
        instructions: result.extractedInstructions
      });
      await addCommentToRequest(requestId, teamId, actorId, "agent", replyContent);

      // 4. Update request status to in_progress and append state entry
      const retryStateEntry = t("retryRequestStateEntry", lang, {
        title: lastTask.title,
        comment: newCommentContent,
        instructions: result.extractedInstructions
      });
      const updatedState = [...(request.state || []), retryStateEntry];

      await db.update(requests).set({
        status: "in_progress",
        state: updatedState,
        updatedAt: new Date()
      }).where(eq(requests.id, requestId));

      // 5. Trigger native LangGraph executor
      console.log(`[comment-evaluation] Triggering Native LangGraph Executor for retried task ${updatedTask.id}`);
      import("./langgraph/executor").then(({ runLangchainExecutor }) => {
        runLangchainExecutor(updatedTask.id).catch(console.error);
      });

    } else if (result.intent === "bypass") {
      // 1. Update task status to success and add bypass message
      await db.update(tasks).set({
        status: "success",
        result: t("bypassTaskResult", lang),
        failureReason: null,
        updatedAt: new Date()
      }).where(eq(tasks.id, lastTask.id));

      // 2. Add acknowledgement comment on Request
      const replyContent = t("bypassAgentReply", lang, { title: lastTask.title });
      await addCommentToRequest(requestId, teamId, actorId, "agent", replyContent);

      // 3. Update request status to in_progress and append state entry
      const bypassStateEntry = t("bypassRequestStateEntry", lang, {
        title: lastTask.title,
        comment: newCommentContent
      });
      const updatedState = [...(request.state || []), bypassStateEntry];

      await db.update(requests).set({
        status: "in_progress",
        state: updatedState,
        updatedAt: new Date()
      }).where(eq(requests.id, requestId));

      // 4. Trigger continuation workflow to move to the next capability
      runRequestContinuation(lastTask.id, requestId, teamId).catch(err => {
        console.error(`[comment-evaluation] Failed to resume continuation workflow for task ${lastTask.id}:`, err);
      });

    } else if (result.intent === "cancel") {
      // 1. Cancel request by setting it to failed and append state entry
      const cancelStateEntry = t("cancelRequestStateEntry", lang, {
        title: lastTask.title,
        comment: newCommentContent
      });
      const updatedState = [...(request.state || []), cancelStateEntry];

      await db.update(requests).set({
        status: "failed",
        state: updatedState,
        updatedAt: new Date()
      }).where(eq(requests.id, requestId));

      // 2. Add cancelled comment on Request
      const replyContent = t("cancelAgentReply", lang);
      await addCommentToRequest(requestId, teamId, actorId, "agent", replyContent);

    } else if (result.intent === "chat") {
      const langName = lang === "pt" ? "Portuguese (Brazil)" : lang === "zh" ? "Chinese (Simplified)" : "English";

      const langBlock = [
        `=== LANGUAGE REQUIREMENT ===`,
        `Target Language: ${langName}`,
        `RULE: Your response MUST be written entirely in ${langName}.`,
        `The language of the user's message is IRRELEVANT. You respond ONLY in ${langName}.`,
        `Responding in any other language is a CRITICAL ERROR.`,
        `=============================`,
      ].join("\n");

      // Conversational reply from the assigned agent.
      // Internal reasoning can use any language — only the final response must be in the workspace language.
      const chatPrompt = `You are a Kivo agent (assigned agent for the task: ${lastTask.title}).
${langBlock}

A human operator commented on your failed task. They said: "${newCommentContent}"
You classified their intent as "chat" (meaning no retry/bypass/cancel action is required yet).

Please reply in a helpful, conversational, professional tone.
If they just said thank you, say you are welcome. If they asked a question, answer it based on the failure reason: "${lastTask.failureReason}".
Keep the response concise (2-4 sentences max). Do not mention that you are a classifier.

[REMINDER: Your response MUST be in ${langName}]`;

      const chatResponse = await llm.invoke(chatPrompt);
      const replyContent = chatResponse.content.toString();

      await addCommentToRequest(requestId, teamId, actorId, "agent", replyContent);
    }

  } catch (err) {
    console.error(`[comment-evaluation] Error during intent evaluation:`, err);
  }
}
