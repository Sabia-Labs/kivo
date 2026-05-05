# Project: kivo - Gemini CLI Instructions

This document provides foundational mandates for Gemini CLI when operating within this workspace. These instructions take absolute precedence over general defaults.

## 🎯 Project Overview
- **Stack:** Kubernetes, OpenClaw, Node.js, React, git, MCP (Linear integration), Telegram (Bot API).
- **Core Goal:** Deploy and manage one or more autonomous AI developers as containers in a Kubernetes cluster. These agents act as full-stack developers, with state/memory persisted in Git for portability and interaction via Telegram.

## 🛠 Engineering Standards

### Coding Style & Conventions
- **Developer Workflow:**
    - **Ticket Ingestion:** Read Linear tickets using `mcp_linear_get_issue` for IDs (e.g., FOR-70) or `mcp_linear_list_issues` for searches. Do not search the local file system for ticket content.
    - **DoR Check:** Question the Definition of Ready (Acceptance Criteria, clear descriptions).
    - **Tech Planning:** Produce documentation and seek approval before coding.
    - **Execution:** Code, test, and submit PRs.
- **Memory:** All state/memory must be stored in Git to allow restoration from zero.
- **Naming:** camelCase for variables, PascalCase for components.
- **Type Safety:** Strict TypeScript.

### Security Strategy
- **Gateway Bind:** Bind to `loopback` only. Never expose 0.0.0.0.
- **Access Control:** Strong access tokens and pairing policies.
- **Secure Connectivity:** Use SSH tunnels (port 18789) or VPN (Tailscale) for the control UI.
- **Privilege:** Run as non-privileged user with Docker sandbox enabled.

### Testing Strategy
- **Framework:** Vitest / Jest.
- **Requirement:** Every bug fix must include a reproduction test.
- **Location:** `.test.ts` files alongside source.

### Documentation
- **Inline:** [e.g., JSDoc for exported functions]
- **Updates:** Always update README.md if CLI commands or environment variables change.

## 🏗 Architectural Guidelines
- **Patterns:** [e.g., Hexagonal Architecture, Clean Architecture, or specific folder structures]
- **State Management:** [e.g., Zustand, Redux, or React Context]
- **Error Handling:** [e.g., Global error boundary, specific Result/Option patterns]

## 🚀 Tooling & Workflow
- **Build Command:** `[e.g., npm run build]`
- **Lint Command:** `[e.g., npm run lint]`
- **Test Command:** `[e.g., npm test]`
- **Pre-Commit:** Ensure `[command]` passes before suggesting a commit.

## 💬 Communication & Language
- **Language:** All code, comments, documentation (including README and ADRs), and interactions must be in English.
- **Verbosity:** Be concise and direct. Focus on technical rationale.
- **Commit Messages:** Follow Conventional Commits (feat:, fix:, etc.) in English.
