# Kivo Kubernetes Architecture

This document describes the high-level architecture of the **Kivo** system when deployed on Kubernetes. It explains how namespaces are organized, how the messaging bus is isolated, and how the "Sidecar Pattern" is employed to enable autonomous agent communication.

## 1. Cluster-Level Namespace Organization

Kivo follows a strict separation of concerns, isolating the Control Plane, the Application Plane, and the Infrastructure components. When a user creates a team, Kivo provisions dedicated, isolated environments.

- **`kivo-admin` (Control Plane):** Houses the Administrative API and UI. This layer manages users, billing, and workspace-level permissions.
- **`kivo` (Application Plane):** The "Brain" of the operation. It contains the `kivo-api` (orchestrator) and the **Kivo Controller** (Go-based Operator) that manages the lifecycle of all agents.
- **`inframessaging` (Data Bus):** A dedicated namespace for the RabbitMQ Cluster. It handles all inter-agent and system-to-agent communications.
- **`rabbitmq-system` (Infrastructure):** Contains the RabbitMQ Cluster Operator, ensuring the messaging bus remains healthy and scalable.
- **`kivo-ws-[id]` (Workspace Tenancy):** A dynamically created namespace for each workspace (e.g., `kivo-ws-a1b2c3d4`). All teams and agents belonging to a specific workspace reside here, ensuring strict network and resource isolation.

### Cluster Topology Diagram
The following diagram represents a workspace with **2 Teams** and **3 Agents each**:

```text
Kubernetes Cluster
│
├── [Namespace: kivo-admin] ───────────────────────────────────────────┐
│   └── 🖥️ Admin Console & API (User Management & Billing)               │
│                                                                       │
├── [Namespace: kivo] ─────────────────────────────────────────────────┤
│   ├── 🧠 Kivo API (Core Team & Agent Orchestrator)                   │
│   └── 🎮 Kivo Controller (Go Operator - reconciles Agent CRDs)       │
│                                                                       │
├── [Namespace: inframessaging] ────────────────────────────────────────┤
│   └── 🐰 RabbitMQ Cluster (The high-performance message broker)       │
│                                                                       │
├── [Namespace: rabbitmq-system] ───────────────────────────────────────┤
│   └── ⚙️ RabbitMQ Operator (Manages RabbitMQ lifecycle)                │
│                                                                       │
└── [Namespace: kivo-ws-a1b2c3d4] (User Workspace) ────────────────────┘
    │   (Isolated environment created deterministically per workspace)
    │
    ├── 👥 Team OPS (Identifier Prefix: OPS)
    │   ├── 🤖 Agent Pod: ops-lead-uuid (Team Lead)
    │   ├── 🤖 Agent Pod: ops-eng-1-uuid
    │   └── 🤖 Agent Pod: ops-eng-2-uuid
    │
    └── 👥 Team DEV (Identifier Prefix: DEV)
        ├── 🤖 Agent Pod: dev-lead-uuid (Team Lead)
        ├── 🤖 Agent Pod: dev-eng-1-uuid
        └── 🤖 Agent Pod: dev-eng-2-uuid
```

---

## 2. Pod Anatomy: The Sidecar Pattern

Each Agent is deployed as a **Multi-container Pod**. Instead of forcing the AI logic to handle complex messaging protocols, Kivo uses a `sidecar` container to act as a bridge.

### Component Breakdown:
1.  **`agent` Container:** The "Brain". Runs the Node.js or Python environment where the AI logic, tool execution, and local file manipulations happen. It communicates via simple HTTP/JSON to its local companion.
2.  **`kivo-consumer` Sidecar:** The "Messenger". This container maintains a persistent AMQP connection to the RabbitMQ cluster in the `inframessaging` namespace. It consumes tasks from the queue and "pushes" them to the agent.

### Internal Pod Diagram

```text
Agent Pod (e.g., ops-lead-uuid)
│
├── [Container: kivo-consumer] (The Sidecar) ────────────────┐
│   │                                                       │
│   ├── ⚡ AMQP Connection (Listens to RabbitMQ queues)       │
│   │    (Authenticated via 'rabbitmq-credentials' Secret)  │
│   │                                                       │
│   └── ↔️ Local Bridge (HTTP/Localhost)                     │
│        (Translates network messages for the Agent)        │
│                                                           │
└── [Container: agent] (The Intelligence) ────────────────────┤
    │                                                       │
    ├── 🧠 OpenClaw / Agent Logic                           │
    │    (Processes tasks, calls LLMs, uses MCP tools)      │
    │                                                       │
    └── 📂 Mounted Volumes                                  │
         ├── /data (Persistent Storage via PVC)             │
         └── /etc/kivo/creds (Linear, GitHub, OpenAI keys) │
```

## 3. Key Architectural Benefits

- **Strict Isolation:** Namespaces and Virtual Hosts (vhosts) in RabbitMQ ensure that one workspace's data and messages never leak into another.
- **Protocol Abstraction:** The `kivo-consumer` sidecar allows the AI agents to be "messaging-agnostic." We can replace RabbitMQ with any other broker by simply updating the sidecar image.
- **Resilience:** If an agent's logic crashes, the sidecar remains alive to report the failure. If the Pod is rescheduled, the Kivo Controller ensures it reconnects to its dedicated message queue and persistent storage immediately.
