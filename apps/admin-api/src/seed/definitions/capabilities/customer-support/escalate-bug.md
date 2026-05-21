---
id: escalate-bug
name_i18n_key: capabilities.customer_support.escalate.name
description_i18n_key: capabilities.customer_support.escalate.desc
type: task_template
team_type: customer-support
featured: false
default_assigned_role: support-analyst
---

# INSTRUCTIONS
Transform a customer reported issue into a high-quality technical Bug Report for the Engineering team.

1. **Reproduction:** Try to understand or simulate the steps to reproduce the issue.
2. **Impact Assessment:** Identify how many users are affected and the severity of the bug.
3. **Technical Drafting:** Create an Issue in the Engineering backlog. Include: "Expected vs Actual Behavior", "Steps to Reproduce", and "Environment Details".
4. **Linking:** Link the new Engineering Issue back to the original customer ticket for traceability.

# INPUTS
- Customer ticket details.

# EXPECTED OUTPUTS
- Link to the newly created Engineering Bug Issue.
- Confirmation of the link between Support and Engineering tools.
