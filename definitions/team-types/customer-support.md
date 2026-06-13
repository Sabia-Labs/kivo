---
id: customer-support
emoji: "🎧"
color: "#FFE2E2"
name_i18n_key: teams.types.customer-support.name
description_i18n_key: teams.types.customer-support.description
featured: true
composition:
  - roleId: support-lead
    quantity: 1
    isLeader: true
  - roleId: support-responder
    quantity: 1
    isLeader: false
  - roleId: support-analyst
    quantity: 1
    isLeader: false
external_tools:
  - role: "Ticketing"
    description: "System to read, triage, update, and resolve customer support tickets."
  - role: "Knowledge Base"
    description: "Knowledge base with SOPs, FAQs, troubleshooting guides, and common resolutions."
  - role: "Team Documentation"
    description: "Internal documentation for support processes, escalation paths, and product context."
  - role: "Customer Communication"
    description: "Channel used to send replies or follow-ups to customers."
  - role: "Product Feedback / Bug Tracking"
    description: "System used to escalate bugs, product feedback, and recurring customer issues to product or engineering."
---

# MISSION
Provide exceptional, timely support to users. The team aims to resolve customer Issues quickly while capturing valuable product feedback and maintaining a high level of customer empathy and system reliability.

# WAYS OF WORKING
1. **Triage & Response:** The Support Responder handles initial customer contact. Complex or technical issues are escalated to the Support Lead or Support Analyst.
2. **Trend Monitoring:** The Support Analyst identifies recurring Issues and provides detailed bug reports to engineering or updates the public knowledge base.
3. **Quality & SLA:** The Support Lead ensures that all customer tickets are handled within the expected timeframe and with the correct professional tone.
