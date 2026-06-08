import { Telegraf } from "telegraf";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { agents, conversations, messages } from "../db/schema";
import { runChatEngine } from "../workflows/langgraph/chatEngine";
import { resolveWorkspaceLanguage } from "./i18n";

class TelegramManager {
  private bots: Map<string, Telegraf> = new Map();

  /**
   * Initializes bots for all agents that have a telegramBotToken configured.
   */
  async initAll() {
    const allAgents = await db.select().from(agents);
    
    for (const agent of allAgents) {
      const meta = agent.metadata as Record<string, any> || {};
      if (meta.telegramBotToken) {
        await this.startBot(agent.id, meta.telegramBotToken);
      }
    }
  }

  /**
   * Starts a Telegram bot for a specific agent.
   */
  async startBot(agentId: string, token: string) {
    if (this.bots.has(agentId)) {
      this.stopBot(agentId);
    }

    const bot = new Telegraf(token);

    // Setup message handler
    bot.on("message", async (ctx) => {
      // Basic text message check
      if (!("text" in ctx.message)) return;
      
      const chatId = String(ctx.chat.id);
      const text = ctx.message.text;

      try {
        // Find agent from DB to get latest metadata
        const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
        if (!agent) return;

        const meta = agent.metadata as Record<string, any> || {};

        // ── 1. Pairing Flow ──────────────────────────────────────────────────
        if (meta.telegramChatId !== chatId) {
          // If already pending pairing for THIS chat, just remind them
          if (meta.telegramPendingChatId === chatId && meta.telegramPairingCode) {
            await ctx.reply(`Your pairing code is: ${meta.telegramPairingCode}\n\nPlease enter this code in the Kivo dashboard to complete the connection.`);
            return;
          }

          // Otherwise, generate new pairing code
          const pairingCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
          
          await db.update(agents)
            .set({
              metadata: {
                ...meta,
                telegramPairingCode: pairingCode,
                telegramPendingChatId: chatId,
              }
            })
            .where(eq(agents.id, agentId));

          await ctx.reply(`Welcome to Kivo! 🚀\n\nYour pairing code is: ${pairingCode}\n\nPlease enter this code in the Kivo dashboard to securely connect this chat with your agent.`);
          return;
        }

        // ── 2. Chat Flow ─────────────────────────────────────────────────────
        // If we get here, the chat is successfully paired.
        
        // Find or create conversation for this Telegram chat
        const prefixedChatId = `telegram:${chatId}`;
        let [conversation] = await db.select().from(conversations).where(
          eq(conversations.agentId, agentId)
        ).then(res => res.filter(c => c.counterpartId === prefixedChatId));

        if (!conversation) {
          const senderName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : "");
          [conversation] = await db.insert(conversations).values({
            agentId: agentId,
            counterpartType: "external",
            counterpartId: prefixedChatId,
            counterpartName: senderName || "Telegram User",
          }).returning();
        }

        // Insert user message into database
        await db.insert(messages).values({
          conversationId: conversation.id,
          role: "user",
          content: text,
        });

        // Bump conversation updatedAt
        await db.update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));

        // Start Chat Engine
        // Note: we set userId to a fake system UUID or empty string since Telegram users might not have a Kivo User ID.
        // Actually, we can use the agent's teamId. We'll pass a dummy userId but ChatEngine should handle it.
        // The best approach is to pass a system UUID, but let's pass the Telegram ID as string.
        runChatEngine({
          conversationId: conversation.id,
          teamId: agent.teamId,
          agentId: agent.id,
          userId: `telegram-${chatId}`, // Pseudo userId
          userMessage: text,
        }).catch(async (err) => {
          console.error(`[Telegram] Failed to run chatEngine for conversation ${conversation.id}:`, err);
          await ctx.reply("An internal error occurred and I could not process your request.");
        });

      } catch (err) {
        console.error(`[Telegram] Error handling message for agent ${agentId}:`, err);
      }
    });

    this.bots.set(agentId, bot);

    // Start listening
    const webhookDomain = process.env.TELEGRAM_WEBHOOK_DOMAIN;
    
    if (webhookDomain && process.env.NODE_ENV !== "development") {
      // Use Webhooks if configured
      const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || "kivo-secret-token-default";
      const webhookPath = `/api/webhooks/telegram/${agentId}`;
      
      console.log(`[Telegram] Registering webhook for agent ${agentId} at ${webhookDomain}${webhookPath}`);
      
      await bot.telegram.setWebhook(`${webhookDomain}${webhookPath}`, {
        secret_token: secretToken
      });
      // The actual HTTP receiving logic will be handled by our Express routes using `bot.handleUpdate`
    } else {
      // Fallback to Polling
      console.log(`[Telegram] Starting polling for agent ${agentId}`);
      bot.launch().catch(err => {
        console.error(`[Telegram] Failed to launch bot polling for agent ${agentId}:`, err);
      });
    }
  }

  /**
   * Stops a specific bot
   */
  stopBot(agentId: string) {
    const bot = this.bots.get(agentId);
    if (bot) {
      bot.stop("Kivo shutting down or bot reconfigured");
      this.bots.delete(agentId);
      console.log(`[Telegram] Stopped bot for agent ${agentId}`);
    }
  }

  /**
   * Gets a bot instance, useful for webhooks
   */
  getBot(agentId: string): Telegraf | undefined {
    return this.bots.get(agentId);
  }

  /**
   * Sends a message to a specific agent's connected Telegram chat
   */
  async sendMessage(agentId: string, text: string) {
    try {
      const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
      if (!agent) return;

      const meta = agent.metadata as Record<string, any> || {};
      const chatId = meta.telegramChatId;

      if (!chatId) {
        console.warn(`[Telegram] Cannot send message for agent ${agentId}: No telegramChatId found`);
        return;
      }

      const bot = this.bots.get(agentId);
      if (!bot) {
        console.warn(`[Telegram] Cannot send message for agent ${agentId}: Bot not active`);
        return;
      }

      await bot.telegram.sendMessage(chatId, text);
    } catch (err) {
      console.error(`[Telegram] Error sending message for agent ${agentId}:`, err);
    }
  }
}

export const telegramManager = new TelegramManager();
