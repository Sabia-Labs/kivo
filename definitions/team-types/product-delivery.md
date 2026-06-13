---
id: product-delivery
name_i18n_key: teams.types.product-delivery.name
description_i18n_key: teams.types.product-delivery.description
featured: true
emoji: "🚀"
color: "#FEF3C7"
composition:
  - roleId: product-delivery-team-lead
    quantity: 1
    isLeader: true
  - roleId: product-manager
    quantity: 1
    isLeader: false
  - roleId: software-architect
    quantity: 1
    isLeader: false
  - roleId: software-engineer
    quantity: 2
    isLeader: false
external_tools:
  - role: "Work Management"
    description: "Source of truth for product issues, tasks, backlog, sprint or kanban status, and delivery priorities."
  - role: "Code Repository"
    description: "Repositories, branching rules, PR workflow, ownership boundaries, and review expectations."
  - role: "Team Documentation"
    description: "Product specs, technical docs, architecture notes, ADRs, and implementation guidelines."
  - role: "CI/CD"
    description: "Build, test, deployment, and release pipeline information."
  - role: "Observability"
    description: "Monitoring, errors, logs, incidents, and production health signals."
  - role: "Communication Channel"
    description: "Channel where the team coordinates with humans and reports delivery status."
---

# MISSION
Deliver high-quality software features from ideation to production. The team aims to bridge the gap between business requirements and technical implementation, ensuring scalability, performance, and user satisfaction through rigorous engineering practices and clear product vision.

# WAYS OF WORKING
1. **Issue Life Cycle:** The Product Manager defines and refines Issues. The Team Lead reviews and assigns them based on team capacity.
2. **Technical Excellence:** The Software Architect defines the patterns. Engineers implement the code following these patterns and opening Pull Requests for review.
3. **Continuous Delivery:** The team maintains a healthy backlog and monitors progress through daily heartbeats and automated status checks.
4. **Communication:** All technical and product decisions must be documented explicitly in the workspace and linked to the corresponding Issues.
