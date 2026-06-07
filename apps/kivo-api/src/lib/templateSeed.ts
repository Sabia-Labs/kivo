import "dotenv/config";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { db } from "../db/client";
import { agentRoles, teamTypes, teamTypeRoles, capabilities, teamTypeCapabilities } from "../db/schema";
import { eq } from "drizzle-orm";

export async function runTemplateSeed() {
  console.log("🌱 Starting Template Seed (Local Filesystem)...");

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
    // 1. Load Shared Blocks
    const sharedDir = path.join(DEFINITIONS_DIR, "shared");
    const agentsBase = fs.readFileSync(path.join(sharedDir, "AGENTS.md"), "utf-8");
    const heartbeatBase = fs.readFileSync(path.join(sharedDir, "HEARTBEAT.md"), "utf-8");
    const memoryBase = fs.readFileSync(path.join(sharedDir, "MEMORY.md"), "utf-8");
    const toolsBase = fs.readFileSync(path.join(sharedDir, "TOOLS.md"), "utf-8");
    const userBase = fs.readFileSync(path.join(sharedDir, "USER.md"), "utf-8");

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
      const soul = sections.find(s => s.startsWith("SOUL"))?.replace(/^SOUL\n/, "").trim() || "";
      const identity = sections.find(s => s.startsWith("IDENTITY"))?.replace(/^IDENTITY\n/, "").trim() || "";
      const operatingInstructions = sections.find(s => s.startsWith("OPERATING INSTRUCTIONS"))?.replace(/^OPERATING INSTRUCTIONS\n/, "").trim() || "";

      console.log(`   -> Syncing Role: ${data.id}`);

      await db.insert(agentRoles).values({
        id: data.id,
        nameI18nKey: data.name_i18n_key,
        descriptionI18nKey: data.description_i18n_key,
        suggestedNameI18nKey: data.suggested_name_i18n_key,
        emoji: data.emoji,
        emojiBgColor: data.emoji_bg_color,
        soul,
        identity,
        operatingInstructions,
        userContext: userBase,
        memory: memoryBase,
        toolsNotes: toolsBase,
        heartbeat: heartbeatBase,
        agentsBase: agentsBase,
      }).onConflictDoUpdate({
        target: agentRoles.id,
        set: {
          nameI18nKey: data.name_i18n_key,
          descriptionI18nKey: data.description_i18n_key,
          suggestedNameI18nKey: data.suggested_name_i18n_key,
          emoji: data.emoji,
          emojiBgColor: data.emoji_bg_color,
          soul,
          identity,
          operatingInstructions,
          userContext: userBase,
          memory: memoryBase,
          toolsNotes: toolsBase,
          heartbeat: heartbeatBase,
          agentsBase: agentsBase,
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
