# Product Requirements Document

## Product overview

An AI job-hunting assistant for one user. A web dashboard and Telegram bot help the user find technology jobs, assess fit, prepare truthful application materials, and track applications. The assistant does not submit applications.

## Problem

Finding relevant roles across job platforms takes repeated searching and manual comparison. Tailoring a CV and cover letter for each job is time-consuming. The product should reduce that work while keeping the user in control of factual claims and final applications.

## User

- **Primary user:** the owner of this personal tool, signing in with email and password.
- **Authorization:** single-owner access in v1. Multi-user accounts, teams, and public registration are out of scope.

## Goals

1. Search for relevant technology jobs on demand through the dashboard and Telegram.
2. Make job fit understandable with a score, reasons, gaps, and uncertainty warnings.
3. Produce reviewable CV and cover-letter variants without fabricating qualifications.
4. Keep the original CV private and unchanged, and make stored files deletable.
5. Let the user track a job from discovery through manual application.

## Non-goals for v1

- Automatically submitting applications, proposals, or messages.
- Scraping LinkedIn or Upwork, bypassing access controls, or using a personal platform login/session.
- Scheduled searches or automatic notifications for new jobs.
- Fiverr or broad unrestricted web crawling.
- Multi-user SaaS, subscriptions, billing, or team roles.
- Interview coaching, recruiter messaging, or a general-purpose career assistant.

## Search scope

### Search modes

- `/site`: on-site jobs in Abuja, Lagos, Port Harcourt, Enugu, and Benue State.
- `/remote`: remote jobs that accept applicants based in Nigeria.
- Searches run only when explicitly requested in v1.

### Sources and access

- LinkedIn and Upwork are the priority sources.
- Use only approved APIs, feeds, or other explicitly permitted interfaces. Do not scrape either platform.
- Request an Upwork API key and verify the approved scope before integrating it.
- If permitted programmatic access is missing or insufficient, the user can import a job by pasting its link and, if needed, the job description. The assistant can score and prepare documents for imported listings.
- Every job must retain source attribution and a link when available.

## Primary journeys

### First-time setup

1. The owner signs in with email and password.
2. Uploads an existing PDF or DOCX CV.
3. The system extracts a draft profile and target preferences.
4. The owner corrects and confirms the profile before it is used for matching or generation.
5. The owner links Telegram to the account using a secure linking flow.

### Find and review jobs

1. The owner runs `/site` or `/remote` from the dashboard or Telegram.
2. The system searches through permitted source access and records a search run.
3. The reader filters for technology roles and scores each candidate from 1.0 to 5.0 in tenths.
4. Each job receives a match rating from 1.0 to 5.0 in tenths.
5. Every scored job appears with its rating, short rationale, fit gaps, source link, and an uncertainty warning when needed.
6. If a source cannot be searched, the owner can paste a job URL or description for evaluation.

### Prepare and apply

1. The owner opens a scored job and reviews its description and fit explanation.
2. The CV Adapter prepares a separate tailored CV and cover letter in PDF and DOCX.
3. The owner previews and downloads the documents, then chooses saved, dismissed, or applied status.
4. The owner follows the source link and submits the application or proposal personally.

### Errors and partial results

- A search run displays progress and its final status, including partial completion.
- Uncertain scoring or failed tailoring leaves the job visible with a warning. A failed document is marked unavailable, never represented as complete.
- Jobs remain visible at every score, including ratings below 4.
- Empty searches show a useful empty state; source errors explain that results may be incomplete and preserve the ability to import a job manually.

## Functional requirements

### Account and profile

- Email/password authentication protects all dashboard data and file downloads.
- V1 supports one owner; public account registration is disabled or otherwise restricted to owner provisioning.
- The owner can edit and confirm fields extracted from the CV, including role history, dates, skills, and target preferences.
- Telegram is linked to the same account; bot actions are authorized against that account.

### CVs and application materials

- Accept PDF and DOCX uploads with validation and private storage.
- Preserve the original upload as immutable source material until the owner deletes it.
- Store extracted facts and confirmed profile separately from generated documents.
- Generate a distinct tailored CV and cover letter per job, with PDF and DOCX downloads.
- Reordering and rewriting are allowed when grounded in confirmed source facts. The system must not invent or inflate skills, employers, achievements, responsibilities, or experience dates.
- Preserve existing layout as closely as practical and warn when conversion quality is uncertain.
- Deleting the source CV must offer deletion of its extracted data and derived files as well.

### Job intake, search, and scoring

- Support `/site`, `/remote`, and manual link/description import in both the dashboard and Telegram.
- Search integrations must use explicitly permitted access. No scraping, credential/session reuse, or access-control circumvention.
- Store the source, source URL, location, description, posting metadata when available, and ingestion timestamp.
- Avoid duplicate jobs based on platform ID or normalized source URL.
- Score technology relevance and personal fit on a 1.0–5.0 scale in tenths and explain the score in plain language.
- Display every score, including scores below 4, with uncertainty and processing warnings when applicable.

### Review and status tracking

- Show job title, company, location/work mode, source, source link, score, rationale, gaps, warning state, and prepared files where available.
- Support `new`, `saved`, `dismissed`, and `applied` states.
- Reflect status updates consistently in web and Telegram.
- Never submit an application automatically. Opening the source listing is the final handoff.

### Telegram

- Support `/site` and `/remote`, manual import, result review, status changes, and document access.
- Keep bot messages concise and link to the dashboard for longer descriptions/previews.
- Prevent an unlinked or unauthorized Telegram user from reading account data or files.

## Data entities

- **Account:** owner identity and authentication reference.
- **Profile:** confirmed job-search preferences and structured CV facts.
- **CV document:** private original or generated document, format, storage reference, version, and parent source CV.
- **Search run:** command, criteria, source attempts, progress, timestamps, and outcome.
- **Job:** source identity, title, company, description, location, remote/on-site mode, URL, and timestamps.
- **Match:** job-to-profile score, explanation, detected gaps, uncertainty/failure warnings.
- **Application package:** tailored CV and cover-letter versions for a job.
- **Job status:** new/saved/dismissed/applied and status timestamps.

## Non-functional requirements

- **Privacy:** CVs, profile details, and generated materials are private. Use protected object storage, authenticated downloads, least-privilege access, and deletion controls. Never log CV contents, credentials, or full API tokens.
- **Security:** HTTPS in production; secure password handling, session protections, CSRF protections as appropriate, secret management, upload validation, and per-account authorization checks.
- **Reliability:** Persist search and generation status; make retries safe and duplicate-resistant. Show partial failures rather than silently dropping work.
- **Performance:** Search and AI document generation are background operations; the UI and bot should return a run identifier/status rather than wait for a long request.
- **Accessibility:** keyboard-operable dashboard, visible focus, semantic controls, and readable contrast.
- **Cost:** no monthly ceiling specified. Prefer low-cost managed services initially and make model/token and storage usage visible enough to control.
- **Scale:** personal-use workload; avoid multi-tenant or high-scale architecture in v1.

## Success measures

- The owner can run both search modes or manually import a job and review the outcome in either interface.
- Duplicate jobs do not repeatedly appear as new.
- Every displayed score has a rationale; uncertain processing is clearly marked.
- Tailored materials are reviewable, downloadable, and grounded in confirmed CV facts.
- No application is submitted without the owner doing so on the source platform.
- The owner can delete the CV and its generated derivatives.

## Assumptions and unresolved decisions

- Target preferences are extracted as a draft and must be confirmed by the owner.
- The cover letter follows the same no-fabrication rule as the CV.
- A one-time linking code is the recommended Telegram account-linking method.
- NVIDIA Build is the configured AI provider; its data-retention terms and monthly budget need review before production use with real profile data. File-storage and hosting providers remain to be selected.
- Exact scoring weights and layout-preservation tolerance require validation with real examples.
- API availability, permitted source coverage, rate limits, and Upwork key approval remain external dependencies.
