# KIVO TEAM OPERATING MODEL

> [!IMPORTANT]
> **CRITICAL CONTEXT:** Whenever we discuss Process, Capabilities, Requests, and Tasks, these are **exclusive entities of the KIVO application** (which acts as the agent orchestration layer). 
> You **MUST** use the **KIVO MCP** to manage these entities and their workflows. Do not confuse them with external systems or general concepts.

This document explains how a Kivo Team operates. The system no longer works based solely on requests. Instead, it operates using:
- Requests (the user's desire and the orchestrating instrument for tasks)
- Tasks (the fundamental unit of work for agents)
- Capabilities (what the team can do)
- Skills (what agents can do)
- Events (how work progresses)

---

## 1. CORE CONCEPTS

### Team
A Team is a group of agents working together to fulfill requests.

Each team has:
- Agents
- Capabilities
- Shared context
- Access to tools and integrations

---

### Agent
An Agent is an executor.

Each agent has:
- A role (e.g. Product Manager, Engineer, Team Lead)
- A set of Skills (what it knows how to do)
- The ability to:
  - Execute tasks
  - Create and respond to requests
  - Produce events

---

### Skill (Agent-level)
A Skill is a concrete ability of an agent.

Examples:
- Write user stories
- Call an API (Linear, GitHub, Jira)
- Analyze logs
- Review code
- Generate code

Skills are **how work gets done**, not what the team offers.

---

### Capability (Team-level)
A Capability defines what the team can deliver.

It is NOT execution. It is a contract.

Each capability defines:
- Inputs
- Expected output
- Instructions
- Who can execute (roles or agents)
- Required skills
- Events it produces
- Events that may suggest using it

#### Example

Capability: `Write User Story`

- Inputs:
  - feature request
  - business context

- Output:
  - structured user story
  - acceptance criteria

- Executable by:
  - Product Manager Agent
  - Team Lead Agent

- Requires skills:
  - product_discovery
  - writing

- Produces events:
  - user_story_written

- Suggested triggers:
  - feature_requested
  
---

### Task
A Task is the fundamental unit of work for an agent (equivalent, for example, to Langgraph NODES). 

Tasks are explicitly assigned to a specific agent who will execute the service and must mark the task status as `completed` when finished. 

Each task has:
- Prompt (the specific command of what to do)
- Instructions (how to execute the task, including capability context and expected output)
- Status:
  - draft
  - open
  - in_progress
  - waiting_user
  - completed
  - cancelled
- Context (An array of strings where the request injects team context, request context, etc., at creation time)
- Assignee (The specific agent executing the task)
- Related capability
- Produced events

> **TODO:** Handle multi-step tasks. When the first task is closed, we need to think about how to continue the step-by-step execution of subsequent tasks for a multi-step request.

#### Example

Task: `Write user story for feature X`
- Capability: Write User Story
- Status: in_progress
- Assignee: Product Manager Agent
- Context: ["Team context info...", "Request context info..."]

---

### Request
A Request represents the user's desire and acts as the orchestrating instrument for Tasks. 

Each request has:
- Sender
- Target (agent, role, or team)
- Payload (what is being asked)
- Status:
  - draft
  - open
  - in_progress
  - waiting_user
  - completed
  - cancelled
- Linked tasks
- Response (result)

Requests orchestrate the workflow by creating Tasks and injecting necessary context (team context, request context) into the Task's context array.

---

### Response
A Response is the result of a Request.

It must:
- Answer the request
- Provide outputs
- Trigger next actions if needed

---

## 2. HOW WORK FLOWS

### Step 1 — A Request is created

A human or agent creates a request to ask for work to be done.

Example:
> "Implement feature X"

This creates a Request. The Request represents the overarching goal and acts as the orchestrator. It may require one or multiple Tasks to be fully resolved.

---

### Step 2 — The Orchestrator Creates Tasks

The system (the Orchestrator) processes the Request, determines what needs to be done, and creates Tasks. The orchestrator takes care of the request lifecycle, leaving the task as the final unit of work for the agents. The orchestrator injects the necessary context (team context, request context) into the tasks.

---

### Step 3 — The Task is assigned to an Agent

The Task is assigned to a specific Agent. The assigned Agent receives a push message via chat notifying them of the new Task with its ID.

> [!WARNING]
> Agents are entirely reactive. You must wait for the incoming notification message for each new task. Polling for tasks, implementing a "heartbeat", or actively querying `list_tasks` to find your own work is expressly forbidden to conserve tokens.

**CRITICAL**: The agent MUST use the Kivo MCP `get_task` tool to fetch the details of this Task before proceeding.

---

### Step 4 — The Agent accepts the Task

After fetching the task with `get_task`, the agent evaluates the instructions and context. 
- If accepted, the agent updates the task status to `in_progress` using the `update_task` tool.
- If rejected, the agent updates the task status to `rejected` with an explanation.

---

### Step 5 — The Agent executes the work

The Agent performs the necessary actions (e.g., writing code, calling APIs, analyzing data) to fulfill the Task.

---

### Step 6 — The Task is completed

Once the task is finished, the Agent MUST update the Task status to `completed` using the `update_task` MCP tool, providing the final output or result.

By completing the task, the agent concludes their unit of work. The Orchestrator system then resumes control of the Request, continuing the step-by-step execution by potentially dispatching the next Task in the sequence until the original Request is fully resolved.