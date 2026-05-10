---
id: implement-work-item
name_i18n_key: capabilities.product_delivery.implement.name
description_i18n_key: capabilities.product_delivery.implement.desc
type: task_template
team_type: product-delivery
featured: true
default_assigned_role: software-engineer
---

# INSTRUCTIONS
Execute the implementation of a specific Issue/Ticket. You are responsible for the entire lifecycle of the change.

1. **Research:** Read the codebase and existing tests to understand the implementation path.
2. **Autonomous Setup:** Create a new branch. Invent a descriptive name following the pattern `feat/short-description` or `fix/issue-id`. Do not ask the Operator for the branch name.
3. **Coding:** Implement the changes according to the acceptance criteria. Ensure your code is idiomatic and follows the project's style (check existing files).
4. **Self-Validation:** Run existing tests or create a new test case to verify your fix/feature. If the environment allows, run linting tools.
5. **Delivery:** Push the branch and open a Pull Request. Document the PR with "What" was changed and "Why".

# INPUTS
- Issue/Ticket ID and description.

# EXPECTED OUTPUTS
- Link to the opened Pull Request.
- Brief summary of the technical approach taken.
