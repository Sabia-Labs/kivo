import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { db } from "../db/client";
import { requests, tasks, comments } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";
import { runRequestContinuation } from "./requestContinuation";
import { updateRequest, addCommentToRequest } from "../controllers/requestsController";
import * as dotenv from "dotenv";
import * as path from "path";

const IntentionSchema = z.object({
  intent: z.enum(["retry", "bypass", "cancel", "chat"]),
  extractedInstructions: z.string().describe("Concise summarization in English of the new instructions, parameters, corrections, or API keys provided by the human operator. Leave empty if intent is not retry."),
  reasoning: z.string().describe("Brief reasoning for the classification."),
});

let llmInstance: ChatOpenAI | null = null;
function getLlm() {
  if (!llmInstance) {
    dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[comment-evaluation] CRITICAL: OPENAI_API_KEY is missing from environment.");
    }
    llmInstance = new ChatOpenAI({ 
      modelName: "gpt-4o", 
      temperature: 0,
      apiKey: apiKey 
    });
  }
  return llmInstance;
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
1. "retry": The operator wants to re-run the failed task, typically providing new details, solutions, corrections, API keys, credentials, or simply asking to try again (e.g., "tenta de novo", "run again", "try with 8080", "here is the correct credentials").
2. "bypass": The operator wants to skip the failed task and proceed to the next task in the workflow (e.g., "pula essa parte", "ignora", "segue para a próxima", "skip this step").
3. "cancel": The operator wants to abort/cancel the entire request (e.g., "cancela tudo", "para o fluxo", "abort").
4. "chat": The operator is just talking, asking a question, saying thank you, saying hello, or making comments that do not imply a specific action.`;

    const result = await structuredLlm.invoke(prompt);
    console.log(`[comment-evaluation] Classified intent: ${result.intent}. Reasoning: ${result.reasoning}`);

    const actorId = lastTask.assignedToId || teamId;

    if (result.intent === "retry") {
      // 1. Update task instructions and reset status to open
      const updatedInstructions = `${lastTask.instructions || ""}\n\n[HUMAN OPERATOR RETRY CORRECTION]:\n${result.extractedInstructions}`;
      
      await db.update(tasks).set({
        status: "open",
        instructions: updatedInstructions,
        failureReason: null,
        updatedAt: new Date()
      }).where(eq(tasks.id, lastTask.id));

      // 2. Add system comment on the Task itself
      await db.insert(comments).values({
        teamId,
        taskId: lastTask.id,
        actorId,
        actorType: "agent",
        content: `Operator requested a retry. Additional instructions applied: ${result.extractedInstructions}`
      });

      // 3. Add acknowledgement comment on Request
      const replyContent = `I have received your new instructions and will retry executing the step **${lastTask.title}** right away!\n\n**Additional Instructions Applied:**\n${result.extractedInstructions}`;
      await addCommentToRequest(requestId, teamId, actorId, "agent", replyContent);

      // 4. Update request status to in_progress
      await updateRequest(requestId, { status: "in_progress" }, teamId, "agent");

      // 5. Trigger the continuation workflow
      runRequestContinuation(lastTask.id, requestId, teamId).catch(err => {
        console.error(`[comment-evaluation] Failed to resume continuation workflow for task ${lastTask.id}:`, err);
      });

    } else if (result.intent === "bypass") {
      // 1. Update task status to success and add bypass message
      await db.update(tasks).set({
        status: "success",
        result: "Bypassed by human operator instructions.",
        failureReason: null,
        updatedAt: new Date()
      }).where(eq(tasks.id, lastTask.id));

      // 2. Add acknowledgement comment on Request
      const replyContent = `Understood. Bypassing the failed step **${lastTask.title}** and proceeding to the next task in the workflow.`;
      await addCommentToRequest(requestId, teamId, actorId, "agent", replyContent);

      // 3. Update request status to in_progress
      await updateRequest(requestId, { status: "in_progress" }, teamId, "agent");

      // 4. Trigger continuation workflow to move to the next capability
      runRequestContinuation(lastTask.id, requestId, teamId).catch(err => {
        console.error(`[comment-evaluation] Failed to resume continuation workflow for task ${lastTask.id}:`, err);
      });

    } else if (result.intent === "cancel") {
      // 1. Cancel request by setting it to failed
      await updateRequest(requestId, { status: "failed" }, teamId, "agent");

      // 2. Add cancelled comment on Request
      const replyContent = `Understood. I have cancelled the request workflow as requested.`;
      await addCommentToRequest(requestId, teamId, actorId, "agent", replyContent);

    } else if (result.intent === "chat") {
      // Conversational reply from the assigned agent
      const chatPrompt = `You are a Kivo agent (assigned agent for the task: ${lastTask.title}).
A human operator commented on your failed task. They said: "${newCommentContent}"
You classified their intent as "chat" (meaning no retry/bypass/cancel action is required yet).

Please reply to the operator in a helpful, conversational, professional tone in the exact language they used (Portuguese, English, Chinese, or whatever language they are speaking).
If they just said thank you, say you are welcome. If they asked a question, answer it based on the failure reason: "${lastTask.failureReason}".
Keep the response concise (2-4 sentences max). Do not mention that you are a classifier.`;

      const chatResponse = await llm.invoke(chatPrompt);
      const replyContent = chatResponse.content.toString();

      await addCommentToRequest(requestId, teamId, actorId, "agent", replyContent);
    }

  } catch (err) {
    console.error(`[comment-evaluation] Error during intent evaluation:`, err);
  }
}
