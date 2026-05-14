---
id: tech-debt-assessment
name_i18n_key: capabilities.product_delivery.tech_debt.name
description_i18n_key: capabilities.product_delivery.tech_debt.desc
type: task_template
team_type: product-delivery
featured: true
default_assigned_role: software-architect
---

# INSTRUCTIONS
Perform a proactive scan of the codebase to identify technical debt, "TODOs", "FIXMEs", or anti-patterns.

1. **Deep Scan:** Search the codebase for comments like TODO, FIXME, or HACK.
2. **Pattern Analysis:** Identify areas with high complexity, lack of type safety (e.g., use of 'any' in TS), or inconsistent patterns.
3. **Impact Evaluation:** Assess which debts are blocking velocity or compromising system stability.
4. **Actionable Backlog:** Create new Issues in the backlog for the most critical items found. Categorize them as "Technical Debt" or "Refactor".

# INPUTS

# EXPECTED OUTPUTS
- A report summarizing the top 3 technical debt areas.
- Links to the new Issues created to address the debt.
