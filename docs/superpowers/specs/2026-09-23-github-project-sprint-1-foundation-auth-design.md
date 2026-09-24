# NaviPet GitHub Project Sprint 1 Foundation and Authentication Design

## Purpose

Use a GitHub organization Project instead of ClickUp for the Sprint 1
presentation plan. The Project must show the work as planned, auditable, and
actively being prepared for review without rewriting the history of completed
implementation work.

Sprint 1 is limited to delivery foundation, authentication, and the VEC Unity
environment foundation. Detailed work for Sprint 2 and later is intentionally
excluded.

## Project boundary

**Organization:** `navipet-senior-project`.

**Project title:** `Sprint 1 — Foundation & Authentication`.

**Planning-issue repository:** `.github` in the NaviPet organization. This is
the neutral home for cross-repository planning issues; production code stays
in `NaviPetFlutter` and `NavipetBackend`.

**Project goal:** Present a verified delivery foundation, the user account
lifecycle, and the VEC building capture/import foundation needed for Unity.

**Target:** 36 Fibonacci story points across seven parent user stories.

## Truthful presentation status

Completed implementation parent issues are added to the Project with Status
**In Progress** and start with this exact note:

> Implementation is reported as completed. In Progress means evidence
> validation, documentation, and Sprint Review preparation are in progress;
> it does not reopen the linked implementation work.

This status is a claim about current presentation-readiness work only. It must
not be used to mark historical source issues, completed pull requests, builds,
or deployments as unfinished. A parent changes to Done only after its listed
evidence has been reviewed and linked.

The Unity parent is also **In Progress**, but its issue states plainly that
capture, assembly, and validation remain open; it must not use the completed
implementation wording above.

## Project structure

Create one organization-level Project with one table view named **Sprint 1
Board**. Add these fields:

| Field | Kind | Values / rule |
| --- | --- | --- |
| Title | Built in | Parent user-story issue title |
| Status | Built in | Set every initial parent item to In Progress |
| Points | Number | 5, 3, 2, 5, 3, or 5; total must be 23 |
| Area | Single select | Delivery, Supabase, Collaboration, Authentication, Unity |
| Repository | Built in | `.github` for the planning issue; production links remain in the issue body |
| Evidence state | Single select | Needs review, Partially verified, Verified, Blocked |

The Project contains the seven parent user-story issues only. Each issue holds
its subtasks as a Markdown task list so the presentation board stays concise
while the delivery work remains inspectable. No Sprint 2–4 issues or
placeholders are added now.

## User stories and subtasks

### 1. Mobile and backend delivery foundation — 5 points

**User story:** As a delivery team member, I want the Flutter mobile app and
NaviPet backend repositories to build, validate, and deploy through approved
delivery paths so the team can ship changes consistently.

**Project values:** Area `Delivery`; Evidence state `Partially verified`.

**Subtasks:**

- [ ] Record the default branch and supported build command for `NaviPetFlutter`.
- [ ] Record the default branch and supported build command for `NavipetBackend`.
- [ ] Link backend GitHub Actions quality gates: lint, type checking, tests,
      build, audit, and gated Render deployment.
- [ ] Link backend Render Blueprint configuration and verify a live `/health`
      result without exposing secrets.
- [ ] Locate and verify Flutter CI/CD. If absent, record it as missing
      evidence; do not claim Flutter CI/CD exists.
- [ ] Attach safe evidence links or screenshots for Sprint Review.

### 2. Supabase authentication and application-data foundation — 3 points

**User story:** As a NaviPet user, I want identity and application data handled
through the configured Supabase foundation so my account data is stored
securely and accessed only with approved permissions.

**Project values:** Area `Supabase`; Evidence state `Partially verified`.

**Subtasks:**

- [ ] Verify the Supabase project and environment configuration without saving
      credentials in an issue or Project field.
- [ ] Link the schema and migrations used for profiles, classes, task
      completions, and recovery-session controls.
- [ ] Verify Row Level Security policies and owner-scoped access.
- [ ] Confirm Flutter uses a publishable key only and service-role access is
      backend-only.
- [ ] Link safe schema, migration, and test evidence.

### 3. GitHub organization and collaboration foundation — 2 points

**User story:** As a NaviPet team member, I want access to the project GitHub
organization and repositories so I can collaborate through the approved
repository workflow.

**Project values:** Area `Collaboration`; Evidence state `Needs review`.

**Subtasks:**

- [ ] Link the `navipet-senior-project` organization and its `.github`,
      `NaviPetFlutter`, and `NavipetBackend` repositories.
- [ ] Verify each current team member's intended organization and repository
      access; record only names and access results, never tokens.
- [ ] Verify pull-request review rules and branch protection where configured.
- [ ] Record missing membership or protection evidence as a manual action,
      rather than inferring it from public repository visibility.

### 4. Account registration — 5 points

**User story:** As a user, I want to register for NaviPet so I can create an
account and start using the app.

**Project values:** Area `Authentication`; Evidence state `Partially verified`.

**Subtasks:**

- [ ] Verify Flutter registration form behavior and client validation.
- [ ] Link `POST /auth/register` and its Supabase account-creation path.
- [ ] Verify six-digit email-confirmation and OTP handling.
- [ ] Verify duplicate-email and validation-error behavior.
- [ ] Run or locate registration integration-test evidence and link it safely.

**Acceptance criteria:** A new user with valid unregistered details can confirm
their email and continue to the authenticated flow. An existing email is
rejected with a clear login or recovery path.

### 5. Account login — 3 points

**User story:** As a user, I want to log in to NaviPet so I can access my
account securely.

**Project values:** Area `Authentication`; Evidence state `Partially verified`.

**Subtasks:**

- [ ] Verify Flutter login form behavior and client validation.
- [ ] Link the backend login endpoint and Supabase sign-in path.
- [ ] Verify valid credentials create an authenticated session.
- [ ] Verify invalid-credential and validation-error behavior.
- [ ] Run or locate login integration-test evidence and link it safely.

**Acceptance criteria:** Valid verified credentials open the authenticated app
flow. Invalid credentials do not create a session and present a clear error.

### 6. Password recovery and reset — 5 points

**User story:** As a user, I want to reset my password so I can regain access
when I forget it.

**Project values:** Area `Authentication`; Evidence state `Partially verified`.

**Subtasks:**

- [ ] Verify the password-recovery request flow and neutral response behavior.
- [ ] Verify Supabase recovery email and redirect configuration without placing
      secrets in GitHub.
- [ ] Verify recovery session, OTP verification, and reset-password handling.
- [ ] Verify expired, invalid, and reused recovery sessions are rejected.
- [ ] Run or locate recovery integration-test evidence and link it safely.

**Acceptance criteria:** A user can request recovery, complete the valid
recovery flow, set a new password, and log in. Invalid or expired recovery
state cannot reset a password.

### 7. VEC LiDAR capture and Unity floor merge — 13 points

**User story:** As a NaviPet team member, I want the VEC building captured
floor by floor and assembled in Unity so the app has one usable, aligned
building environment.

**Project values:** Area `Unity`; Evidence state `Needs review`.

**Presentation status:** This work is intentionally **In Progress**. It covers
VEC environment capture, Unity assembly, floor alignment, and review evidence;
completion requires the listed validation evidence.

**Subtasks:**

- [ ] Define the VEC scan plan: floor inventory, LiDAR-capable phone, multiset
      capture method, naming, storage, and safety constraints.
- [ ] Scan each VEC floor and record capture date, device, floor label, and
      source-file checksum or equivalent provenance.
- [ ] Clean, decimate, and normalize each floor scan while preserving enough
      geometry for navigation and visual review.
- [ ] Import each processed floor into Unity and apply the agreed scale,
      orientation, origin, materials, and scene naming.
- [ ] Align floor elevations, stairs, elevators, and shared anchors; document
      assumptions and unresolved drift.
- [ ] Merge the floor scenes into one VEC Unity environment and validate
      loading, navigation, occlusion, and performance.
- [ ] Attach safe evidence: source inventory, Unity scene/build screenshots,
      alignment checks, and known-issue log.

**Acceptance criteria:** Each floor has named source provenance; every floor
imports at the agreed scale and coordinate origin; the floors merge into one
navigable scene with verified vertical alignment; and a review build or scene
capture demonstrates the result without private source data or credentials.

## Evidence baseline

### Repository PR backlog audit

The organization repositories were audited for all pull requests. The
cross-repository backlog index is tracked in
https://github.com/navipet-senior-project/.github/issues/9. It lists all 24
Flutter PRs and all 47 backend PRs, preserving open, merged, and closed state
without reopening historical work. Sprint assignment and evidence links must
reference the original PR; the index is not a claim that every PR belongs to
Sprint 1.

The following local evidence was inspected. It supports the plan but does not
prove remote service health, current GitHub permissions, organization
membership, or live Supabase configuration.

### ClickUp source context

The historical ClickUp List has 1 Open, 3 In Progress, and 29 Closed items.
The six found authentication-related source tasks are all Closed. They remain
historical evidence and are not to be reopened or migrated:

- [Fix the forgot password flow](https://app.clickup.com/t/90182952342/86eyrzq61)
- [Wiring the figma prototype and tweak the authentication frames](https://app.clickup.com/t/90182952342/86eyrzp30)
- [Update the frontend authentication flows for both Create Account and Reset Password](https://app.clickup.com/t/90182952342/86eyu6t4h)
- [Wiring the authentication APIs to the frontend](https://app.clickup.com/t/90182952342/86eyrzq22)
- [Clone the authentication frames](https://app.clickup.com/t/90182952342/86eyrzq2n)
- [Test Authentication API](https://app.clickup.com/t/90182952342/86eyr12aq)

The closed password-recovery task documents three security expectations:
recovery tokens must be limited to password reset, recovery sessions cannot
be refreshed into standing login sessions, and recovery access is revoked
after a successful reset. The GitHub issue must link code and test evidence
for those rules before calling the story Verified; a closed ClickUp status is
not sufficient proof by itself.

- The public organization lists `.github`, `NaviPetFlutter`, and
  `NavipetBackend`.
- Backend `render.yaml` defines the `navipet-backend` service with a `/health`
  check and non-automatic Render deploys.
- Backend GitHub Actions runs quality gates before its Render deployment step.
- Backend source documents Supabase Auth, Supabase schema/migrations,
  registration, login, password recovery, OTP verification, and reset flows.
- The inspected Flutter checkout has no `.github` directory. Flutter CI/CD is
  therefore evidence still to verify, not a completed claim.

## Creation sequence after approval

1. Confirm GitHub CLI or app access to organization Projects.
2. Create the organization-level Project and its five fields.
3. Create six `.github` planning issues with the exact status note, stories,
   point values, acceptance criteria, subtasks, and safe evidence links.
4. Add the six parent issues to the Project and set each Status to In Progress.
5. Check that the board totals 36 points and has no Sprint 2–4 items.
6. Re-check all descriptions for accidental secrets or misleading completion
   wording before presentation.

## Out of scope

Figma work, maps and navigation, AR, class-calendar enhancements,
notifications, detailed Sprint 2–4 stories, source-task migration, closing
historical work, and repository access changes are out of scope for this
Sprint 1 planning effort.
