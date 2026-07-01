# Bumssistant — Datenschutz / DSGVO Notes

Working document for the DPO and Betriebsrat. Describes what the system processes and the
technical controls built into the code. **Not legal advice** — the legal basis and works-council
approval are the company's responsibility (see "Open items").

## What is processed
| Data | Source | Purpose | Retention |
|---|---|---|---|
| Name, email, job title, department | Entra ID profile | Identify user, warm-start | While account active |
| Calendar metadata (times, recurrence) | MS Graph | Infer work patterns | Derived summary only; raw not stored |
| **Email subjects only** | MS Graph | Infer communication style/patterns | **Discarded after summary** |
| Jira issues assigned to user | Jira API | Seed tasks/projects | While relevant |
| Chat messages with Bumssistant | User | Assistance + memory | User-controlled |

**Email bodies are never read. Full inbox is never scanned — sent-mail subjects only.**

## Technical controls (built into the code)
1. **Data minimization** — subjects only; raw subjects discarded after deriving a summary.
2. **Consent gate** — AI inferences stored as `status='proposed'` until the user confirms.
   Nothing about a user is treated as fact without their say-so.
3. **Auditability** — every memory row records `source`, `confidence`, timestamps.
4. **Right to erasure (Art. 17)** — `ON DELETE CASCADE` from `users`; one action wipes a user.
5. **EU-only processing** — LLM/embeddings go to Langdock (EU-hosted); no third-country transfer.
6. **Purpose limitation** — subject data used solely for style/pattern inference.
7. **Prod-only scanning** — real data is scanned only when `ENVIRONMENT=production`; dev is
   forced to synthetic mock data (private laptops stay clean of personal data).

## Open items (company/legal — NOT solvable in code)
- [ ] **Legal basis** — consent vs. **Betriebsvereinbarung** (recommended in an employment context).
- [ ] **Betriebsrat (§87 BetrVG)** — co-determination applies; involve early.
- [ ] **Transparency notice** — written notice to users of what is read and why.
- [ ] **AVV / DPA** with Langdock and hosting provider.
