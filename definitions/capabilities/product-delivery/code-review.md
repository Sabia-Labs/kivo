---
id: code-review
name: Code Review
type: task_template
team_type: product-delivery
featured: false
default_assigned_role: software-architect
---

# INSTRUCTIONS
Review an open Pull Request to ensure it meets the team's quality standards.

1. **Context Alignment:** Read the original Issue to understand the goal of the PR.
2. **Structural Review:** Check if the changes follow the project's architectural patterns. Look for clean abstractions and proper separation of concerns.
3. **Logic & Safety:** Identify potential edge cases, security vulnerabilities, or performance bottlenecks.
4. **Feedback:** Provide constructive, actionable comments on the PR. If the code is solid, approve it. If not, request changes with clear explanations.

# INPUTS
- Pull Request URL or ID.

# EXPECTED OUTPUTS
- Confirmation of the review performed.
- Summary of the feedback provided or approval status.
