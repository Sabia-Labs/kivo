import { Router, type Request, type Response } from "express";
import { telegramManager } from "../lib/telegramManager";

export const webhooksRouter = Router();

// Endpoint for receiving Telegram Webhooks
webhooksRouter.post("/telegram/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params;
  
  // Verify secret token for security
  const secretToken = req.header("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "kivo-secret-token-default";
  
  if (secretToken !== expectedSecret) {
    res.status(401).send("Unauthorized");
    return;
  }

  const bot = telegramManager.getBot(agentId as string);
  if (!bot) {
    // If we don't have a bot running for this agent, return 404
    res.status(404).send("Bot not found");
    return;
  }

  try {
    // Let Telegraf handle the webhook update
    await bot.handleUpdate(req.body, res);
  } catch (err) {
    console.error(`[Telegram] Error handling webhook for agent ${agentId}:`, err);
    res.status(500).send("Internal Server Error");
  }
});
