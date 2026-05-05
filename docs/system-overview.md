# Kivo System Overview

## System Summary

**Kivo**, by **Sabia Labs**, is a platform for deploying and operating autonomous AI agent teams with structured roles, governed workflows, and real-time health visibility.

The architecture is designed to work across environments:
- start with a local, web-based agent team
- grow into customer-configurable Kubernetes deployments
- later add automation for infrastructure provisioning and operational monitoring

## Architectural Model

Kivo separates the platform into two distinct planes, enabling a **Cell-based Architecture** for infinite scalability and data isolation:

### 1. Control Plane (Admin/Global)
The **Control Plane** manages global state, user identities, and marketing. It is the entry point for administrative operations.
- **Frontend:** `admin-web` (www.kivo.com) - Marketing, Docs, Login, Signup.
- **Backend:** `admin-api` (Port 4001) - Global registry.
- **Database:** `kivo_admin` (Global).
- **Namespace:** `kivo-admin`.

### 2. Application Plane (App/Regional)
The **Application Plane** manages the actual execution of agent teams. These "cells" can be deployed in different regions to stay close to customer data.
- **Frontend:** `kivo-web` (app.kivo.com or customer.kivo.com) - Client Portal.
- **Backend:** `api` (Port 4000) - Team & Task logic.
- **Database:** `kivo` (Tenant-specific).
- **Namespace:** `kivo`.

## Core Concepts

### Team

A **team** is the central unit in Kivo. Every team has:
- a **template** that defines its starting structure (Starter, Engineering, Customer Support)
- a **Team Lead** — the minimum ownership role, always required
- zero or more additional agents with scoped roles
- optional integrations, approval policies, and operating norms

Teams live inside a **workspace**, which represents the customer or organization context.

### Team Lead

The **Team Lead** is the universal ownership primitive in Kivo. Every team — regardless of template or domain — must have at least one Team Lead responsible for coordination, routing, and escalation.

### Agent

An **agent** is an OpenClaw-based runtime configured with:
- a specific role and persona
- operating rules and memory persistence
- integration access patterns
- approval boundaries

Agents are grouped into teams and must operate within the governance model defined for their team.

### Template

A **template** defines the default role composition and workflow discipline for a team. Templates are starting points — teams can evolve their composition over time.

| Template | Description |
|---|---|
| **starter** | Minimal team — Team Lead only. General-purpose or exploratory use. |
| **engineering** | Full software delivery squad with SDLC discipline. |
| **customer_support** | *(Coming soon)* Automated support team. |

## Core Building Blocks

### 1. Agent Runtime
The runtime is an OpenClaw-based agent configured per role and team.

The first runtime targets include:
- **Team Lead** — coordination and ownership (universal)
- **Software Engineer** — implementation, testing, PRs (Engineering template)
- **Software Architect** — system design, ADRs, technical standards (Engineering template)
- **Product Manager** — backlog, tickets, acceptance criteria (Engineering template)

### 2. Container Layer
Each agent is packaged into a portable container image defining:
- OS base image and OpenClaw installation
- required tooling per role
- runtime entrypoint
- mounted paths for workspace, memory, and credentials

### 3. Local Operations Layer
For the MVP, local Docker-based execution is the primary operating mode:
- run agents locally with injected secrets
- mount persistent state
- test agent behavior safely before any Kubernetes deployment

### 4. Integration Layer
Integrations connect agents to external systems. The integration model is designed to be generalized and customer-configurable, not hardcoded.

Current integration targets (Engineering template):
- **Linear** — ticket ingestion and project tracking

Planned:
- additional project management backends (Jira, etc.)
- version control integrations (GitHub, etc.)

### 5. Kubernetes Deployment Layer
After the local MVP, the next target is Kubernetes:
- Helm charts for agent team deployment
- values-driven customer configuration
- resource sizing per agent role
- scaling and lifecycle controls
- deployment portability across environments

### 6. Infrastructure Provisioning Layer
All infrastructure provisioning is managed in the separate `sabia-infra` repository using Terraform. The `sabia-infra` repository is the single source of truth for the cloud lifecycle (GCP, WIF, Networking, IAM, Billing).
This includes:
- Kubernetes clusters and node pools
- identity and access bindings
- secret management dependencies
- environment prerequisites

### 7. Future Operations Layer
Longer-term additions may include Kubernetes operators or controllers for:
- health monitoring and scoring
- performance monitoring
- autonomous maintenance workflows
- environment-specific policy enforcement

## Initial Workflow

### MVP workflow
1. Sign up and create a workspace.
2. Choose a team template (Starter, Engineering, Customer Support).
3. Configure the team (name, Team Lead, additional agents as needed).
4. For Engineering: connect integrations (project tracking, VCS).
5. Deploy agents — approvals remain required for consequential external actions.
6. Monitor team health in real time.

### Future customer workflow
1. Provision infrastructure with Terraform (via `sabia-infra` repo).
2. Deploy a customer-specific agent team with Helm.
3. Configure integrations using customer-provided values.
4. Operate the agents through approved workflows.
5. Observe, optimize, and scale the deployment over time.

## Configuration Philosophy

Configuration must be:
- explicit and portable
- customer-specific where needed
- separate from secrets
- suitable for local and cluster-based deployment modes

Examples of customer-specific configuration:
- team template and role composition
- project management backend selection
- agent personas and operating norms
- approval policies and execution boundaries
- environment sizing and resource limits

## Security Model

Security principles include:
- loopback-only exposure for sensitive interfaces where possible
- explicit approval boundaries for external actions
- no secrets committed to Git
- customer-specific credentials managed outside the repository
- clear separation between operator identity and agent identity
- sensitive execution capabilities mediated through clearly bounded sandbox environments

## Execution Model Principle

Agents should have access to appropriate tooling for their role, but deeper execution capabilities must be mediated through controlled, auditable layers.

The architecture should distinguish between:
- the main agent runtime (reasoning, planning, editing, coordination)
- separate execution environments for heavier or more sensitive operations

## Architectural Direction

The architecture evolves from **single-agent local runtime** to **configurable agent team platform**.

The system is not only about what one agent does. It is about how agent teams are:
- structured and templated
- created and configured
- deployed and constrained
- integrated with customer systems
- operated and monitored
- restored from persistent state
