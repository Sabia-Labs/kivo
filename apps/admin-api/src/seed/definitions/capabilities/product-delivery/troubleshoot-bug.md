---
id: troubleshoot-bug
name_i18n_key: capabilities.product_delivery.troubleshoot.name
description_i18n_key: capabilities.product_delivery.troubleshoot.desc
type: task_template
team_type: product-delivery
featured: true
default_assigned_role: software-engineer
---

# INSTRUCTIONS
Perform a technical investigation to identify the root cause of a reported bug.

1. **Information Ingestion:** Read the bug report thoroughly. Look for "Steps to Reproduce", "Expected vs Actual Behavior", and any provided logs or screenshots.
2. **Environment Discovery:** Identify which parts of the codebase or infrastructure are involved. Use your search tools to find relevant code sections.
3. **Deep Dive:** Analyze logs, check database states, or run local reproduction scripts. Your goal is to move from "it's broken" to "I know exactly why it's broken".
4. **Root Cause Analysis (RCA):** Document your findings. Explain the technical reason for the failure.
5. **Fix Proposal:** Suggest a technical path to resolve the issue. If the fix is minor, you may implement it directly. If complex, update the Issue with your proposal and wait for feedback or a separate "Implement" task.

# INPUTS
- Bug Issue/Ticket ID or detailed report.

# EXPECTED OUTPUTS
- A clear Root Cause Analysis report.
- Link to the Issue updated with findings.
- (Optional) Link to a Pull Request if a fix was applied.
