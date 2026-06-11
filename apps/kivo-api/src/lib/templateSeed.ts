import "dotenv/config";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { db } from "../db/client";
import { 
  agentRoles, 
  teamTypes, 
  teamTypeRoles, 
  capabilities, 
  teamTypeCapabilities,
  llmModels,
  plans 
} from "../db/schema";
import { eq } from "drizzle-orm";

export async function runTemplateSeed() {
  console.log("🌱 Starting Template Seed (Local Filesystem)...");

  try {
    // 1. Sync LLM Models
    console.log("🔍 Syncing LLM Models catalog...");
    const defaultModels = [
      {
        id: "qwen2.5-coder:1.5b",
        name: "Qwen 2.5 Coder 1.5B (Local)",
        provider: "local",
        tier: "free",
        costPerCall: 0.1,
      },
      {
        id: "qwen3:8b",
        name: "Qwen 3 8B (Local)",
        provider: "local",
        tier: "free",
        costPerCall: 0.1,
      },
      {
        id: "gpt-5.4-nano",
        name: "GPT-5.4 Nano (Cheapest)",
        provider: "openai",
        tier: "basic",
        costPerCall: 0.1,
      },
      {
        id: "gpt-5.4-mini",
        name: "GPT-5.4 Mini (Fast)",
        provider: "openai",
        tier: "basic",
        costPerCall: 0.5,
      },
      {
        id: "gemini-3.1-flash-lite",
        name: "Gemini 3.1 Flash-Lite (Fast)",
        provider: "gemini",
        tier: "basic",
        costPerCall: 0.1,
      },
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash (Agentic)",
        provider: "gemini",
        tier: "basic",
        costPerCall: 0.5,
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash (Speed)",
        provider: "deepseek",
        tier: "basic",
        costPerCall: 0.5,
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5 (Top)",
        provider: "openai",
        tier: "pro",
        costPerCall: 2.0,
      },
      {
        id: "gemini-3.5-pro",
        name: "Gemini 3.5 Pro (Multimodal)",
        provider: "gemini",
        tier: "pro",
        costPerCall: 2.0,
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro (Flagship)",
        provider: "deepseek",
        tier: "pro",
        costPerCall: 1.5,
      }
    ];

    for (const m of defaultModels) {
      await db
        .insert(llmModels)
        .values({
          id: m.id,
          name: m.name,
          provider: m.provider,
          tier: m.tier,
          costPerCall: m.costPerCall,
        })
        .onConflictDoUpdate({
          target: llmModels.id,
          set: {
            name: m.name,
            provider: m.provider,
            tier: m.tier,
            costPerCall: m.costPerCall,
          },
        });
    }
  } catch (err) {
    console.error("❌ LLM Models seed failed:", err instanceof Error ? err.message : err);
  }

  try {
    console.log("🌱 Seeding Plans...");
    const defaultPlans = [
      {
        tier: "free" as const,
        teamLimit: 2,
        agentsPerTeamLimit: 4,
        monthlyAutomationLimit: 100,
        dailyAiCredits: 10,
        defaultLeaderModel: "qwen3:8b",
        defaultExecutorModel: "qwen2.5-coder:1.5b",
      },
      {
        tier: "basic" as const,
        teamLimit: 5,
        agentsPerTeamLimit: 8,
        monthlyAutomationLimit: 1000,
        dailyAiCredits: 100,
        defaultLeaderModel: "gpt-5.4-mini",
        defaultExecutorModel: "gemini-3.5-flash",
      },
      {
        tier: "pro" as const,
        teamLimit: 9999, // Uncapped
        agentsPerTeamLimit: 9999,
        monthlyAutomationLimit: 10000,
        dailyAiCredits: 500,
        defaultLeaderModel: "gpt-5.5",
        defaultExecutorModel: "deepseek-v4-pro",
      }
    ];

    for (const p of defaultPlans) {
      await db
        .insert(plans)
        .values(p)
        .onConflictDoUpdate({
          target: plans.tier,
          set: p,
        });
    }
  } catch (err) {
    console.error("❌ Plans seed failed:", err instanceof Error ? err.message : err);
  }

  // Em dev local (tsx), __dirname = src/lib
  let definitionsPath = path.resolve(__dirname, "../../../../definitions");
  if (!fs.existsSync(definitionsPath)) {
    // No Docker (esbuild bundle em dist/index.js), __dirname = dist
    definitionsPath = path.resolve(__dirname, "../definitions");
    if (!fs.existsSync(definitionsPath)) {
      console.warn(`❌ [template-seed] Definitions directory not found at ${definitionsPath}. Skipping seed.`);
      return;
    }
  }
  const DEFINITIONS_DIR = definitionsPath;

  try {
    // 2. Sync Agent Roles
    const rolesDir = path.join(DEFINITIONS_DIR, "agent-roles");
    const roleFiles = fs.readdirSync(rolesDir).filter(f => f.endsWith(".md"));

    console.log(`🔍 Found ${roleFiles.length} agent roles.`);

    for (const file of roleFiles) {
      const filePath = path.join(rolesDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const { data, content: body } = matter(content);

      // Split body by H1 sections
      const sections = body.split(/^# /m).filter(s => s.trim());
      const identity = sections.find(s => s.startsWith("IDENTITY"))?.replace(/^IDENTITY\n/, "").trim() || "";
      const competence = sections.find(s => s.startsWith("COMPETENCE"))?.replace(/^COMPETENCE\n/, "").trim() || "";

      console.log(`   -> Syncing Role: ${data.id}`);

      await db.insert(agentRoles).values({
        id: data.id,
        nameI18nKey: data.name_i18n_key,
        descriptionI18nKey: data.description_i18n_key,
        suggestedNameI18nKey: data.suggested_name_i18n_key,
        emoji: data.emoji,
        emojiBgColor: data.emoji_bg_color,
        identity,
        competence,
      }).onConflictDoUpdate({
        target: agentRoles.id,
        set: {
          nameI18nKey: data.name_i18n_key,
          descriptionI18nKey: data.description_i18n_key,
          suggestedNameI18nKey: data.suggested_name_i18n_key,
          emoji: data.emoji,
          emojiBgColor: data.emoji_bg_color,
          identity,
          competence,
        }
      });
    }

    // 3. Sync Team Types
    const teamTypesDir = path.join(DEFINITIONS_DIR, "team-types");
    const teamFiles = fs.readdirSync(teamTypesDir).filter(f => f.endsWith(".md"));

    console.log(`🔍 Found ${teamFiles.length} team types.`);

    for (const file of teamFiles) {
      const filePath = path.join(teamTypesDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const { data, content: body } = matter(content);

      const sections = body.split(/^# /m).filter(s => s.trim());
      const mission = sections.find(s => s.startsWith("MISSION"))?.replace(/^MISSION\n/, "").trim() || "";
      const waysOfWorking = sections.find(s => s.startsWith("WAYS OF WORKING"))?.replace(/^WAYS OF WORKING\n/, "").trim() || "";

      console.log(`   -> Syncing Team Type: ${data.id}`);

      await db.insert(teamTypes).values({
        id: data.id,
        nameI18nKey: data.name_i18n_key,
        descriptionI18nKey: data.description_i18n_key,
        emoji: data.emoji,
        color: data.color,
        featured: data.featured,
        mission,
        waysOfWorking,
        externalTools: data.external_tools || [],
      }).onConflictDoUpdate({
        target: teamTypes.id,
        set: {
          nameI18nKey: data.name_i18n_key,
          descriptionI18nKey: data.description_i18n_key,
          emoji: data.emoji,
          color: data.color,
          featured: data.featured,
          mission,
          waysOfWorking,
          externalTools: data.external_tools || [],
        }
      });

      // 4. Sync Team Type Roles (Composition)
      await db.delete(teamTypeRoles).where(eq(teamTypeRoles.teamTypeId, data.id));

      if (data.composition && Array.isArray(data.composition)) {
        for (const comp of data.composition) {
          await db.insert(teamTypeRoles).values({
            teamTypeId: data.id,
            agentRoleId: comp.roleId,
            quantity: comp.quantity || 1,
            isLeader: comp.isLeader || false,
          }).onConflictDoNothing();
        }
      }
    }

    // 5. Sync Capabilities (Recursive)
    const capabilitiesRootDir = path.join(DEFINITIONS_DIR, "capabilities");
    
    function getFilesRecursively(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
          results = results.concat(getFilesRecursively(file));
        } else if (file.endsWith(".md")) {
          results.push(file);
        }
      });
      return results;
    }

    const capabilityFiles = getFilesRecursively(capabilitiesRootDir);
    console.log(`🔍 Found ${capabilityFiles.length} capabilities.`);

    // Clear all team_type_capabilities first to avoid stale links
    await db.delete(teamTypeCapabilities);

    for (const filePath of capabilityFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const { data, content: body } = matter(content);

      const sections = body.split(/^# /m).filter(s => s.trim());
      const instructions = sections.find(s => s.startsWith("INSTRUCTIONS"))?.replace(/^INSTRUCTIONS\n/, "").trim() || "";
      const inputsDescription = sections.find(s => s.startsWith("INPUTS"))?.replace(/^INPUTS\n/, "").trim() || "";
      const expectedOutputsDescription = sections.find(s => s.startsWith("EXPECTED OUTPUTS"))?.replace(/^EXPECTED OUTPUTS\n/, "").trim() || "";

      console.log(`   -> Syncing Capability: ${data.id}`);

      await db.insert(capabilities).values({
        id: data.id,
        name: data.name,
        type: data.type,
        instructions,
        inputsDescription,
        expectedOutputsDescription,
        tasksWorkflow: data.tasks_workflow || [],
        loopOver: data.loop_over || null,
        loopItem: data.loop_item || null,
        runWorkflow: data.run_workflow || null,
      }).onConflictDoUpdate({
        target: capabilities.id,
        set: {
          name: data.name,
          type: data.type,
          instructions,
          inputsDescription,
          expectedOutputsDescription,
          tasksWorkflow: data.tasks_workflow || [],
          loopOver: data.loop_over || null,
          loopItem: data.loop_item || null,
          runWorkflow: data.run_workflow || null,
        }
      });

      // Create link to Team Type
      if (data.team_type) {
        await db.insert(teamTypeCapabilities).values({
          teamTypeId: data.team_type,
          capabilityId: data.id,
          isFavorite: data.featured || false,
          defaultAssignedRole: data.default_assigned_role,
        }).onConflictDoNothing();
      }
    }

    console.log("✅ Seed complete!");
  } catch (err) {
    console.error(`❌ Template Seed failed:`, err instanceof Error ? err.message : err);
  }
}
