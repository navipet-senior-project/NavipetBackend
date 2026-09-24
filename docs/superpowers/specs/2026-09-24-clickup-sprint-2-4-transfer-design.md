# NaviPet ClickUp Sprint 2–4 Transfer Design

## Purpose

Transfer every task in the NaviPet ClickUp List to the GitHub organization
Project while keeping Sprint 1 work in the existing Sprint 1 Project.
The GitHub presentation must remain concise: task evidence belongs in
source-linked Markdown checklists inside parent user-story issues, not as
thirty-three separate Project cards.

## Scope and source baseline

**ClickUp source:** `https://app.clickup.com/90182952342/v/l/6-901820242561-1`

**Source count:** 33 tasks: 29 Closed, 3 In Progress, and 1 Open.

**Existing Sprint 1 Project:** organization `navipet-senior-project`, Project
#3, `Sprint 1 — Foundation & Authentication`. Its seven existing parent
stories, issues, fields, values, and items are preserved.

**New Projects:** one organization Project each for Sprint 2, Sprint 3, and
Sprint 4. New planning issues live in `navipet-senior-project/.github`.

## Transfer rules

- Every imported checklist entry preserves its exact ClickUp task title and
  direct source URL.
- Closed ClickUp tasks use `[x]`; Open and In Progress ClickUp tasks use
  `[ ]`.
- A closed source task is historical completion evidence only. It does not
  claim production verification beyond the ClickUp status.
- Existing Sprint 1 items retain their current Project status. No source task,
  pull request, or existing issue is deleted or moved.
- Each new Project receives parent user-story issues only. Individual ClickUp
  tasks stay in issue checklists to avoid backlog clutter.

## Sprint 1: attach 17 source tasks to existing stories

### Delivery foundation

- [x] Make a new backend repository
- [x] Learn about Nodejs, Fastify
- [x] Implementing Render
- [x] Build simple CI/CD pipeline for the backend
- [x] Learn about Flutter
- [x] Clone the app on github and try to build it
- [x] Learn about using codex to work with the project

### Registration, login, and recovery

- [x] Wiring the figma prototype and tweak the authentication frames
- [x] Update the frontend authentication flows frontend for both Create Account and Reset Password.
- [x] Wiring the authentication apis to the frontend
- [x] Clone the authentication frames
- [x] Test Authentication API
- [x] Fix the forgot password flow

### Unity foundation

- [x] Importing the texture 3d map into unity
- [x] Merging the indoor buidling together on Unity
- [ ] Mapping the first floor with waypoint of VEC building using Unity

Each checklist entry is linked to its corresponding ClickUp task during
implementation. The final placement follows the existing Sprint 1 story
boundary: delivery tasks to delivery foundation; authentication tasks to
registration, login, or recovery; and Unity tasks to the Unity story.

## Sprint 2: Profile and schedule management

### Parent story: Profile management

As a user, I want to manage my profile so I can maintain current account
information and navigate account settings reliably.

- [ ] Make upload profile avatar API for user
- [x] Create Edit apis for edit profile and get api for getting profile
- [x] Fix the profile settings where the buttons can't find the routes to other screenss

### Parent story: Class schedule management

As a user, I want to manage my classes so I can build and maintain a usable
schedule.

- [x] Adding constraint for add classes api
- [x] make frame for adding classes and tasks
- [x] Make APIs for Adding classes screen and integrate with UUID. Using supabase mcp
- [x] Integrate adding classes api

## Sprint 3: Discovery, navigation, and indoor-map research

### Parent story: Campus discovery and indoor-map research

As a user, I want to find campus destinations and understand indoor map data
so I can begin navigation with useful results.

- [x] Design and Create autocomplete apis for the map and recent search or recent places
- [x] Research on labeling the Indoor map and how can we integrate it to our app using multiset API

### Parent story: Route navigation experience

As a user, I want reliable route discovery and preview controls so I can
understand and start navigation confidently.

- [x] Update and Customize UI + Follow Google Maps search flow for directions
- [x] Add the buttons from frame figma map 2d to the frontend
- [x] Fix the map where it is interactable during or before navigation. There's a bug where it doesnt do it and you have to refesh the app to make it work again
- [x] Fix the preview screen where it showcases the destination before navigating

## Sprint 4: Product polish and presentation

### Parent story: UX polish and interaction quality

As a user, I want clear, responsive interactions so I can move through
NaviPet confidently.

- [ ] Make it where whichever screen you are on, the corresponding button will glow rather than the default pet screen thats constantly glowing
- [x] Make UI better for user flows and WOW "KISS"
- [ ] Polishing the current features

### Parent story: Presentation assets

As a stakeholder, I want clear report and design artifacts so I can review
NaviPet's product direction and delivered work.

- [x] Write Report and Figma

## Project configuration

Each new Sprint Project uses the existing Sprint 1 convention:

- table view named `Sprint N Board`;
- parent user-story issues only;
- fields: Status, Points, Area, Evidence state, and built-in repository and
  assignee metadata;
- `In Progress` for parent stories containing an Open or In Progress source
  task; `Done` only when every source task in that parent is closed;
- `Needs review` evidence state for all new parent stories until GitHub review
  evidence is added.

No workflow, permission, branch-protection, secret, source-code, or
production-deployment setting changes are part of this transfer.
