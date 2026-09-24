# ClickUp Sprint 2–4 Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the 33-task ClickUp record in GitHub Projects, retaining Sprint 1 history and creating concise Sprint 2–4 presentation projects.

**Architecture:** Existing Sprint 1 issues remain the parent stories for 16 historical source tasks. Three new organization Projects each contain two parent user stories; their ClickUp tasks stay as source-linked Markdown checklists. All mutations use `gh` against `navipet-senior-project`; code, access controls, and existing Project items remain untouched.

**Tech Stack:** GitHub CLI, GitHub Projects GraphQL/REST backing used by `gh`, GitHub Issues Markdown.

**Spec:** `docs/superpowers/specs/2026-09-24-clickup-sprint-2-4-transfer-design.md`

## Global Constraints

- Preserve every existing issue, pull request, Project item, field, and workflow.
- Use `.github` as the repository for cross-repository planning issues.
- Preserve each ClickUp title verbatim and link directly to its `app.clickup.com/t/90182952342/<task-id>` source.
- Use `[x]` only for ClickUp tasks marked Closed; use `[ ]` for Open or In Progress source tasks.
- Do not change production code, permissions, secrets, billing, branch protection, or deployments.
- Create parent user-story issues only; do not add standalone ClickUp task cards.

## Review Focus

- A source task appears exactly once across Sprint 1–4 checklists.
- Every source link resolves to its intended ClickUp task ID and title.
- Open or In Progress source tasks remain unchecked.
- New parent story status matches its checklist state instead of forcing a presentation-only status.
- Existing Sprint 1 Project #3 remains at seven parent items; the transfer adds no standalone cards to it.

---

### Task 1: Verify baseline and define idempotent import variables

**Files:**
- Read: `docs/superpowers/specs/2026-09-24-clickup-sprint-2-4-transfer-design.md`
- Modify: GitHub issue bodies and organization Projects only

**Interfaces:**
- Consumes: organization `navipet-senior-project`, planning repository `.github`, Sprint 1 Project #3.
- Produces: verified baseline data and variables for each created Project number and field ID.

- [ ] **Step 1: Verify the source and Project baseline**

Run:

```bash
gh project view 3 --owner navipet-senior-project --format json
gh project item-list 3 --owner navipet-senior-project --limit 200 --format json
gh issue list --repo navipet-senior-project/.github --state all --limit 20 --json number,title,url
```

Expected: Project #3 has seven issue items and no pull-request items.

- [ ] **Step 2: Record pre-change issue titles and Project item count**

Run:

```bash
gh project item-list 3 --owner navipet-senior-project --limit 200 --format json \
  | jq '{issues:([.items[] | select(.content.type == "Issue")]|length), pull_requests:([.items[] | select(.content.type == "PullRequest")]|length)}'
```

Expected: `issues` is `7`; `pull_requests` is `0`.

### Task 2: Add Sprint 1 ClickUp history to existing parent stories

**Files:**
- Modify: `.github` issues #2, #4, #5, #6, #7, and #8

**Interfaces:**
- Consumes: existing Sprint 1 parent stories.
- Produces: an `## Imported ClickUp tasks` section on each applicable story.

- [ ] **Step 1: Append Delivery foundation history to issue #2**

Append these closed source-linked checklist entries:

```markdown
## Imported ClickUp tasks
- [x] [Make a new backend repository](https://app.clickup.com/t/90182952342/86eyqnnxg)
- [x] [Learn about Nodejs, Fastify](https://app.clickup.com/t/90182952342/86eyqnpzk)
- [x] [Implementing Render](https://app.clickup.com/t/90182952342/86eyqnp0w)
- [x] [Build simple CI/CD pipeline for the backend](https://app.clickup.com/t/90182952342/86eyqpcg5)
- [x] [Learn about Flutter](https://app.clickup.com/t/90182952342/86eyqnq9d)
- [x] [Clone the app on github and try to build it](https://app.clickup.com/t/90182952342/86eyqnnwn)
```

- [ ] **Step 2: Append collaboration, registration, login, recovery, and Unity history**

Append the following closed entries to #4:

```markdown
- [x] [Learn about using codex to work with the project](https://app.clickup.com/t/90182952342/86eyqnt2d)
```

Append the following closed entries to #5:

```markdown
- [x] [Wiring the figma prototype and tweak the authentication frames](https://app.clickup.com/t/90182952342/86eyrzp30)
- [x] [Update the frontend authentication flows frontend for both Create Account and Reset Password.](https://app.clickup.com/t/90182952342/86eyu6t4h)
- [x] [Wiring the authentication apis to the frontend](https://app.clickup.com/t/90182952342/86eyrzq22)
- [x] [Clone the authentication frames](https://app.clickup.com/t/90182952342/86eyrzq2n)
```

Append this closed entry to #6:

```markdown
- [x] [Test Authentication API](https://app.clickup.com/t/90182952342/86eyr12aq)
```

Append this closed entry to #7:

```markdown
- [x] [Fix the forgot password flow](https://app.clickup.com/t/90182952342/86eyrzq61)
```

Append these entries to #8:

```markdown
- [x] [Importing the texture 3d map into unity](https://app.clickup.com/t/90182952342/86eyqnp2p)
- [x] [Merging the indoor buidling together on Unity](https://app.clickup.com/t/90182952342/86eyu6wa0)
- [ ] [Mapping the first floor with waypoint of VEC building using Unity](https://app.clickup.com/t/90182952342/z8v0kmrgfd)
```

- [ ] **Step 3: Verify exact Sprint 1 import count**

Run:

```bash
for n in 2 4 5 6 7 8; do
  gh issue view "$n" --repo navipet-senior-project/.github --json body --jq .body
done | rg 'app\.clickup\.com/t/90182952342/' | wc -l
```

Expected: 16 newly imported source tasks, plus any historical ClickUp links that already existed.

### Task 3: Create and configure the Sprint 2 Project

**Files:**
- Create: organization Project `Sprint 2 — Profile & Schedule`
- Create: `.github` issues `Sprint 2: Profile management` and `Sprint 2: Class schedule management`

**Interfaces:**
- Consumes: `gh project create`, `gh project field-create`, `gh issue create`, `gh project item-add`.
- Produces: a two-item Sprint 2 Project with source-linked work.

- [ ] **Step 1: Create the Project and its shared custom fields**

Run the following command to create the Project and capture its returned number, then add the fields:

```bash
sprint_2_number=$(gh project create --owner navipet-senior-project --title "Sprint 2 — Profile & Schedule" --format json --jq .number)
gh project field-create "$sprint_2_number" --owner navipet-senior-project --name Points --data-type NUMBER
gh project field-create "$sprint_2_number" --owner navipet-senior-project --name Area --data-type SINGLE_SELECT --single-select-options "Profile,Schedule"
gh project field-create "$sprint_2_number" --owner navipet-senior-project --name Evidence state --data-type SINGLE_SELECT --single-select-options "Needs review,Partially verified,Verified,Blocked"
```

- [ ] **Step 2: Create source-linked parent issues**

Create `Sprint 2: Profile management` with the avatar, get/edit profile, and profile-route task entries. Create `Sprint 2: Class schedule management` with constraints, class frame, UUID API, and class integration entries. Copy task title, URL, and checkbox state exactly from the approved spec.

- [ ] **Step 3: Add parents and set presentation values**

Add both issue URLs with `gh project item-add`. Set Profile to `In Progress`, 5 points, Area `Profile`, Evidence state `Needs review`. Set Class schedule to `Done`, 5 points, Area `Schedule`, Evidence state `Needs review`.

- [ ] **Step 4: Verify Sprint 2**

Run:

```bash
gh project item-list "$sprint_2_number" --owner navipet-senior-project --limit 50 --format json
```

Expected: exactly two issue items, zero pull-request items, and seven source-linked ClickUp checklist entries.

### Task 4: Create and configure the Sprint 3 Project

**Files:**
- Create: organization Project `Sprint 3 — Navigation & Indoor Mapping`
- Create: `.github` issues `Sprint 3: Campus discovery and indoor-map research` and `Sprint 3: Route navigation experience`

**Interfaces:**
- Consumes: same `gh` operations and field schema as Sprint 2.
- Produces: a two-item Sprint 3 Project.

- [ ] **Step 1: Create Project and fields**

Create the Project and capture its number, then create `Points`, `Area` with `Discovery,Navigation`, and `Evidence state` with the exact options used in Sprint 2:

```bash
sprint_3_number=$(gh project create --owner navipet-senior-project --title "Sprint 3 — Navigation & Indoor Mapping" --format json --jq .number)
gh project field-create "$sprint_3_number" --owner navipet-senior-project --name Points --data-type NUMBER
gh project field-create "$sprint_3_number" --owner navipet-senior-project --name Area --data-type SINGLE_SELECT --single-select-options "Discovery,Navigation"
gh project field-create "$sprint_3_number" --owner navipet-senior-project --name Evidence state --data-type SINGLE_SELECT --single-select-options "Needs review,Partially verified,Verified,Blocked"
```

- [ ] **Step 2: Create source-linked parent issues**

Create Campus discovery with two checked entries: autocomplete/recent places and indoor-map labeling research. Create Route navigation with four checked entries: Google Maps flow, Map 2D buttons, map interactivity fix, and route preview. Copy exact title and source URL from the approved spec.

- [ ] **Step 3: Add parents and set values**

Add both issue URLs to the new Project. Set both to `Done`, 5 points, area `Discovery` or `Navigation`, and `Needs review` evidence state.

- [ ] **Step 4: Verify Sprint 3**

Run `gh project item-list "$sprint_3_number" --owner navipet-senior-project --limit 50 --format json`.

Expected: two issue items, zero pull-request items, and six checked ClickUp source entries.

### Task 5: Create and configure the Sprint 4 Project

**Files:**
- Create: organization Project `Sprint 4 — Product Polish & Presentation`
- Create: `.github` issues `Sprint 4: UX polish and interaction quality` and `Sprint 4: Presentation assets`

**Interfaces:**
- Consumes: same `gh` operations and field schema as Sprint 2.
- Produces: a two-item Sprint 4 Project.

- [ ] **Step 1: Create Project and fields**

Create the Project and capture its number, then create `Points`, `Area` with `UX,Presentation`, and `Evidence state` with the exact options used in Sprint 2:

```bash
sprint_4_number=$(gh project create --owner navipet-senior-project --title "Sprint 4 — Product Polish & Presentation" --format json --jq .number)
gh project field-create "$sprint_4_number" --owner navipet-senior-project --name Points --data-type NUMBER
gh project field-create "$sprint_4_number" --owner navipet-senior-project --name Area --data-type SINGLE_SELECT --single-select-options "UX,Presentation"
gh project field-create "$sprint_4_number" --owner navipet-senior-project --name Evidence state --data-type SINGLE_SELECT --single-select-options "Needs review,Partially verified,Verified,Blocked"
```

- [ ] **Step 2: Create source-linked parent issues**

Create UX polish with unchecked active-navigation button and feature-polish entries plus checked KISS-flow entry. Create Presentation assets with the checked Report and Figma entry. Copy exact title and source URL from the approved spec.

- [ ] **Step 3: Add parents and set values**

Add both issue URLs to the new Project. Set UX polish to `In Progress`, 3 points, Area `UX`; set Presentation assets to `Done`, 2 points, Area `Presentation`; set both evidence states to `Needs review`.

- [ ] **Step 4: Verify Sprint 4**

Run `gh project item-list "$sprint_4_number" --owner navipet-senior-project --limit 50 --format json`.

Expected: two issue items, zero pull-request items, and four ClickUp source entries with two unchecked active tasks.

### Task 6: Verify organization-wide preservation and task coverage

**Files:**
- Read: all created Projects and Sprint 1 issues

**Interfaces:**
- Consumes: Project numbers created in Tasks 3–5.
- Produces: an auditable final transfer count.

- [ ] **Step 1: Verify all Project item counts**

Run:

```bash
for number in 3 "$sprint_2_number" "$sprint_3_number" "$sprint_4_number"; do
  gh project item-list "$number" --owner navipet-senior-project --limit 200 --format json \
    | jq '{total:(.items|length), issues:([.items[] | select(.content.type == "Issue")]|length), pull_requests:([.items[] | select(.content.type == "PullRequest")]|length)}'
done
```

Expected: Sprint 1 stays at seven issues and zero pull requests; Sprints 2–4 have two issues and zero pull requests each.

- [ ] **Step 2: Verify all source links and checkbox states**

Use `gh issue view` to export the 12 parent issue bodies that contain imported source tasks, then count unique ClickUp task URLs. Confirm 33 unique URLs, 29 checked Closed tasks, and 4 unchecked active tasks.

- [ ] **Step 3: Verify no unrelated state changed**

Run:

```bash
gh project list --owner navipet-senior-project --limit 30 --format json
gh project field-list 3 --owner navipet-senior-project --format json
```

Expected: Sprint 1 title, fields, and seven existing items remain; the three new Sprint Projects are visible.

- [ ] **Step 4: Commit the plan documentation**

```bash
git add docs/superpowers/plans/2026-09-24-clickup-sprint-2-4-transfer.md
git commit -m "docs: add ClickUp sprint transfer plan"
```
