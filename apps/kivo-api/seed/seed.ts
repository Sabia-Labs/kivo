/**
 * Kivo API — Seed Script (Application Plane)
 *
 * This script seeds meta configuration: Team Types, Meta Capabilities, and Agent Roles.
 * It does NOT seed any specific workspace data (teams, agents, tasks).
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://kivo:kivo@localhost:5432/kivo",
});

const db = drizzle(pool, { schema });

async function main() {
  console.log("🌱 Seeding Kivo Application Plane (Meta Configuration Only)...\n");

  // ── 0. Meta Configuration ───────────────────────────────────────────────────
  console.log("→ Seeding Team Types...");
  const teamTypes = [
    { id: "starter", name: "team_type_starter", description: "team_type_desc_starter", featured: true, mission: "Empower general purpose experimentation and everyday tasks.", waysOfWorking: "We embrace a flexible, ad-hoc approach to task management. We communicate openly and favor quick iteration over rigorous planning." },
    { id: "engineering", name: "team_type_engineering", description: "team_type_desc_engineering", featured: true, mission: "Ship high-quality product increments on time by coordinating engineering, design, and business stakeholders.", waysOfWorking: "We follow an agile workflow with clear iterations. We emphasize code review, comprehensive testing, and clear documentation." },
    { id: "customer_support", name: "team_type_customer_support", description: "team_type_desc_customer_support", featured: true, mission: "Provide exceptional, timely support to our users. We aim to resolve issues quickly while capturing product feedback.", waysOfWorking: "We prioritize tickets by impact and SLA. We maintain clear and empathetic communication with users." },
    { id: "sales", name: "team_type_sales", description: "team_type_desc_sales", featured: false },
    { id: "marketing", name: "team_type_marketing", description: "team_type_desc_marketing", featured: false },
  ];
  for (const type of teamTypes) {
    await db.insert(schema.teamTypes).values(type).onConflictDoNothing();
  }
  console.log("  ✓ Team types seeded.\n");

  console.log("→ Seeding Team Meta Capabilities...");
  const teamMetaCapabilitiesData = [
    { teamTypeId: "engineering", name: "Resolve a bug", identifier: "resolve-a-bug", instructions: "Analyze a reported bug, identify root cause, propose or implement a fix, and validate the result.", inputsDescription: "Bug description and identification if present (id, etc) + customer identification, reproduction steps, expected behavior, actual behavior, logs or screenshots if available.", expectedOutputsDescription: "Root cause analysis, proposed fix, implementation notes, validation result, and updated task status.", isFavorite: true },
    { teamTypeId: "engineering", name: "Request a feature", identifier: "request-a-feature", instructions: "Turn a product idea or customer request into a structured feature proposal or user story.", inputsDescription: "Problem statement, target user, expected outcome, constraints, priority, and relevant context.", expectedOutputsDescription: "Clear user story, acceptance criteria, implementation notes, and suggested priority." },
    { teamTypeId: "engineering", name: "Plan technical work", identifier: "plan-technical-work", instructions: "Analyze a technical problem and produce an implementation plan.", inputsDescription: "Technical goal, current architecture context, constraints, risks, and affected systems.", expectedOutputsDescription: "Technical plan, trade-offs, risks, implementation steps, and validation strategy." },
    { teamTypeId: "engineering", name: "Review implementation", identifier: "review-implementation", instructions: "Review a code change or implementation plan for quality, risks, and completeness.", inputsDescription: "Pull request, code diff, task description, architecture context, and acceptance criteria.", expectedOutputsDescription: "Review comments, risks, required changes, and approval recommendation." },
    { teamTypeId: "customer_support", name: "Triage open tickets", identifier: "triage-open-tickets", instructions: "Review open customer tickets, classify them, prioritize them, and suggest next actions.", inputsDescription: "List of open tickets, customer priority, SLA information, product area, and recent context.", expectedOutputsDescription: "Prioritized ticket list, classification, owner recommendation, and next action for each ticket." },
    { teamTypeId: "customer_support", name: "Answer a customer ticket", identifier: "answer-a-customer-ticket", instructions: "Draft a clear and helpful response to a specific customer ticket.", inputsDescription: "Ticket content, customer history, product documentation, known issues, and desired tone.", expectedOutputsDescription: "Suggested customer response, internal notes, and follow-up actions." },
    { teamTypeId: "customer_support", name: "Escalate a bug to engineering", identifier: "escalate-a-bug-to-engineering", instructions: "Convert a customer issue into a structured engineering bug report.", inputsDescription: "Customer ticket, reproduction steps, impact, affected account, logs, screenshots, and urgency.", expectedOutputsDescription: "Engineering-ready bug report with impact, reproduction steps, priority, and supporting evidence." },
    { teamTypeId: "customer_support", name: "Write knowledge base article", identifier: "write-knowledge-base-article", instructions: "Create or improve a knowledge base article based on repeated customer questions or resolved tickets.", inputsDescription: "Topic, resolved ticket examples, product behavior, troubleshooting steps, and target audience.", expectedOutputsDescription: "Knowledge base draft with title, summary, steps, screenshots placeholders, and related links." },
    { teamTypeId: "starter", name: "Ask anything", identifier: "ask-anything", instructions: "Ask the team any general question or request help with thinking, writing, planning, or analysis.", inputsDescription: "User question, goal, relevant context, and preferred output format.", expectedOutputsDescription: "Helpful answer, recommendation, summary, draft, or next-step proposal.", isFavorite: true },
    { teamTypeId: "starter", name: "Summarize content", identifier: "summarize-content", instructions: "Summarize text, notes, documents, tickets, or long context into a concise output.", inputsDescription: "Content to summarize, desired length, audience, and focus areas.", expectedOutputsDescription: "Clear summary with key points, decisions, risks, and action items when relevant.", isFavorite: true },
    { teamTypeId: "starter", name: "Translate text", identifier: "translate-text", instructions: "Translate text while preserving meaning, tone, and professional context.", inputsDescription: "Source text, source language if known, target language, tone preference, and context.", expectedOutputsDescription: "Translated text, optionally with notes about nuance or alternative phrasing." },
    { teamTypeId: "starter", name: "Research a topic", identifier: "research-a-topic", instructions: "Research a topic and produce a structured explanation or recommendation.", inputsDescription: "Topic, question, desired depth, constraints, and preferred format.", expectedOutputsDescription: "Structured research summary, findings, trade-offs, recommendation, and sources if available." },
    { teamTypeId: "starter", name: "Create a plan", identifier: "create-a-plan", instructions: "Turn a goal into a practical plan with steps, risks, and milestones.", inputsDescription: "Goal, deadline, constraints, resources, and success criteria.", expectedOutputsDescription: "Action plan, milestones, assumptions, risks, and next steps." }
  ];
  
  // Clear existing meta capabilities to prevent duplicates
  await db.delete(schema.teamMetaCapabilities);
  
  for (const cap of teamMetaCapabilitiesData) {
    await db.insert(schema.teamMetaCapabilities).values(cap);
  }
  console.log("  ✓ Team meta capabilities seeded.\n");

  console.log("→ Seeding Agent Roles...");
  const profilesDir = path.resolve(__dirname, "../../agents/profiles");
  const readProfileField = (roleId: string, filename: string) => {
    const filePath = path.join(profilesDir, roleId, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
    return null;
  };

  const baseAgentRoles = [
    { id: "team_lead", name: "agent_role_team_lead", description: "agent_desc_team_lead", emoji: "👑", backgroundColor: "#4F46E5", suggestedName: "team_lead_suggested_name" },
    { id: "software_engineer", name: "agent_role_software_engineer", description: "agent_desc_software_engineer", emoji: "💻", backgroundColor: "#10B981", suggestedName: "engineer_suggested_name" },
    { id: "software_architect", name: "agent_role_software_architect", description: "agent_desc_software_architect", emoji: "🏛️", backgroundColor: "#8B5CF6", suggestedName: "architect_suggested_name" },
    { id: "product_manager", name: "agent_role_product_manager", description: "agent_desc_product_manager", emoji: "🚀", backgroundColor: "#F59E0B", suggestedName: "pm_suggested_name" },
    { id: "support_responder", name: "agent_role_support_responder", description: "agent_desc_support_responder", emoji: "🎧", backgroundColor: "#3B82F6", suggestedName: "responder_suggested_name" },
    { id: "support_analist", name: "agent_role_support_analist", description: "agent_desc_support_analist", emoji: "🔍", backgroundColor: "#EC4899", suggestedName: "analyst_suggested_name" },
  ];

  const agentRoles = baseAgentRoles.map(role => ({
    ...role,
    soul: readProfileField(role.id, "SOUL.md"),
    identity: readProfileField(role.id, "IDENTITY.md"),
    agentsInstructions: readProfileField(role.id, "AGENTS.md"),
    userContext: readProfileField(role.id, "USER.md"),
    memory: readProfileField(role.id, "MEMORY.md"),
    toolsNotes: readProfileField(role.id, "TOOLS.md"),
    heartbeat: readProfileField(role.id, "HEARTBEAT.md"),
  }));

  for (const role of agentRoles) {
    await db.insert(schema.agentRoles).values(role).onConflictDoUpdate({
      target: schema.agentRoles.id,
      set: {
        soul: role.soul,
        identity: role.identity,
        agentsInstructions: role.agentsInstructions,
        userContext: role.userContext,
        memory: role.memory,
        toolsNotes: role.toolsNotes,
        heartbeat: role.heartbeat,
      }
    });
  }
  console.log("  ✓ Agent roles seeded.\n");

  console.log("→ Seeding Team Type Roles...");
  const teamTypeRoles = [
    { teamTypeId: "starter", agentRoleId: "team_lead", isLeader: true },
    { teamTypeId: "engineering", agentRoleId: "team_lead", isLeader: true },
    { teamTypeId: "engineering", agentRoleId: "software_engineer", isLeader: false },
    { teamTypeId: "engineering", agentRoleId: "software_architect", isLeader: false },
    { teamTypeId: "engineering", agentRoleId: "product_manager", isLeader: false },
    { teamTypeId: "customer_support", agentRoleId: "team_lead", isLeader: true },
    { teamTypeId: "customer_support", agentRoleId: "support_responder", isLeader: false },
    { teamTypeId: "customer_support", agentRoleId: "support_analist", isLeader: false },
  ];
  for (const ttr of teamTypeRoles) {
    await db.insert(schema.teamTypeRoles).values(ttr).onConflictDoNothing();
  }
  console.log("  ✓ Team type roles seeded.\n");

  console.log("\n✅ Application seed complete!\n");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
