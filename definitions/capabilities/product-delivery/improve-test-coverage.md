---
id: improve-test-coverage
name: Improve Test Coverage
type: task_template
team_type: product-delivery
featured: false
default_assigned_role: software-engineer
---

# INSTRUCTIONS
Analyze a specific part of the system and implement new unit tests to improve its reliability and coverage.

1. **Area Assessment:** Scan the provided component, folder, or area (e.g., `src/db`, `components/ui`). Identify existing tests and find "blind spots" (untested logic, edge cases).
2. **Strategy:** Define which scenarios need testing (Happy Path, Error Handling, Boundary Conditions).
3. **Implementation:** Write high-quality unit tests using the project's testing framework (e.g., Vitest, Jest). Ensure tests are independent, descriptive, and fast.
4. **Validation:** Run the new tests and ensure they pass. If possible, run a coverage report to confirm the improvement.
5. **Delivery:** Commit the new tests, open a Pull Request, and summarize the increase in coverage or the new scenarios protected.

# INPUTS
- Target Area (Component name, folder path, or functional module).

# EXPECTED OUTPUTS
- Link to the Pull Request containing the new tests.
- Summary of new test cases added and logic covered.
