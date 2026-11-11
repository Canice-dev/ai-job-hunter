# Implementation Plan

## Goal

Build a personal job-hunting assistant with a Next.js dashboard and Telegram bot. It searches jobs only when requested, filters and scores technology roles, prepares truthful CVs and cover letters, and leaves application submission to the user.

## Decisions already made

- One personal account; dashboard sign-in uses email and password.
- Web dashboard and Telegram bot are both review surfaces.
- Search is on demand through `/site` and `/remote`; no scheduled searches in v1.
- `/site` covers on-site jobs in Abuja, Lagos, Port Harcourt, Enugu, and Benue State.
- `/remote` covers jobs open to applicants based in Nigeria.
- LinkedIn and Upwork are priority sources, accessed only through permitted means. Do not scrape either site. Request an approved Upwork API key; use manual job import when permitted programmatic access is unavailable.
- An orchestrator runs three separate stages: Scout, Job Reader, and CV Adapter.
- Score job fit from 1.0 to 5.0 in tenths. Show every scored job, including scores below 4, and include a warning if scoring or tailoring is uncertain.
- Accept and produce PDF and DOCX. Preserve the uploaded layout as closely as practical.
- Keep the original CV unchanged. Tailored CVs and cover letters may reorder sections and rewrite wording using only confirmed facts; never add experience, skills, employers, or dates.
- Show the job link and prepared materials. The user submits applications on LinkedIn or Upwork.
- Track jobs as new, saved, dismissed, or applied. Allow deletion of uploaded and generated CV files.
- Preferred stack: Python for AI and backend, Next.js for web, Neon for PostgreSQL.

### Provider and privacy choices (recorded 2026-11-11)

- **AI provider used by the project:** NVIDIA Build through its OpenAI-compatible API. The project README documents `nvidia/nemotron-3.5-lightning-30b-a3b` as the model example. Whether real profile facts may be sent to this hosted provider remains subject to the privacy review below.
- **Web search for Telegram `/site`:** Tavily Search API. Send only the user's job keywords and target location; exclude LinkedIn, Upwork, and Remote OK from this web search. Store the resulting job link and short result excerpt in the owner's tracker while respecting the original publisher's terms.
- **CV files in local development:** private local filesystem storage under `apps/api/.local-data/cvs` by default, outside the web app's public directory. Production object storage is still undecided; it must be private and support deletion.
- **Data sent to AI:** send only the profile sections and job description needed for scoring or tailoring. Do not send the original CV file, extracted raw CV text, or direct identity fields such as name, email, and phone. Profile summaries and work/education facts can still be personal data.
- **Data at rest and deletion:** uploaded file bytes stay outside PostgreSQL; extracted text and profile facts are stored in PostgreSQL. Deleting/replacing the CV must remove the original and dependent derived materials. Backup expiry and production retention periods remain to be defined.
- **Privacy gate for hosted AI:** document NVIDIA's applicable data-processing, retention, and training-use terms before relying on the service with real profile facts in production. The completed local CV upload and profile-confirmation flow is separate from this gate. Do not log CV contents, profile facts, credentials, or provider secrets.

## Delivery phases

### 0. Resolve implementation choices

- Confirm whether NVIDIA Build is acceptable for production after reviewing its data-processing and retention terms; otherwise select another provider or a local model.
- Select the production private file-storage provider, hosting provider, and background queue/worker deployment. Keep the local filesystem as the development default only.
- Confirm the first account provisioning flow and secure Telegram linking flow.
- Apply for Upwork API access and verify the approved API scope supports the intended discovery use. Identify permitted LinkedIn access; do not build a scraper.
- Document AI data handling, retention, training use, deletion, and cost before sending real profile data.

**Exit criteria:** production providers, API access strategy, privacy terms, data retention, and fallback behavior are documented before real profile data is sent to a hosted AI provider or the app is deployed for production use. The local CV onboarding flow is already implemented.

### 1. Establish the application foundation

- Create a monorepo with a Next.js web app, Python API/worker service, and shared API contract documentation.
- Configure local development, environment-based secrets, database migrations, and separate development/production configuration.
- Set up Neon PostgreSQL and private object storage; keep CV files out of public buckets and database rows.
- Implement the single-owner email/password account and protected dashboard routes.

**Exit criteria:** the owner can sign in, reach a protected empty dashboard, and the API can connect to the database and private file storage.

### 2. CV onboarding and profile confirmation — local MVP implemented

- Upload PDF or DOCX CVs with file type and size validation.
- Extract text and structured facts; retain the original file as the source of truth.
- Present extracted roles, skills, dates, location/work eligibility, and preferences as an editable draft.
- Require confirmation before using profile facts for matching or generating application materials.
- Provide deletion of the original and all derived files.

**Status:** implemented for local use. The app accepts text-based PDF and DOCX files, extracts a draft profile, lets the owner review and confirm it, and supports deleting the source CV and derived profile data. Scanned-PDF OCR and production private object storage remain out of scope for this completed local MVP.

### 3. Job intake and search

- Implement job records, source attribution, duplicate detection, search runs, and manual URL/description import.
- Search the public web for on-site Nigerian IT jobs when the owner sends Telegram `/site [keywords]`. NVIDIA formulates a search query and reviews the results by calling a bounded Tavily search tool. Search target locations are Abuja, Lagos, Port Harcourt, Enugu, and Benue State. Without keywords, search general IT areas; supplied keywords narrow the search. Use the provider's last-week published-date filter, label results estimated within the last hour as fresh, and retain only dated results in the configured lookback window (`SITE_LOOKBACK_DAYS` in `apps/api/src/api/services/site_jobs.py`; currently 7 days).
- Add LinkedIn access only through an approved/permitted interface and only within that interface's scope.
- Add Upwork access only after API authorization and scope verification.
- Provide manual import fallback from both dashboard and Telegram when a source cannot be accessed programmatically.
- Implement `/site` and `/remote` as on-demand search commands. Persist each run and report progress, partial results, and failures.

**Exit criteria:** a source listing can be ingested once, attributed to its source, and shown with a working source link; the user can manually import a listing when API access is absent.

### 4. Scoring, filtering, and application materials — implemented locally

- Implement the technology-role filter and a transparent 1.0–5.0 match score in tenths, with concise reasons and gaps.
- Show all scored jobs regardless of rating; preserve uncertainty warnings.
- Tailor a separate CV and cover letter using only confirmed profile facts and the job description.
- Produce DOCX and PDF outputs; retain the original CV and preserve its layout where feasible.
- On parsing or generation failure, retain the job with a warning and clearly indicate which material is unavailable.

**Status:** implemented locally. Jobs can be scored on the 1.0–5.0 scale with strengths and gaps, and remain visible regardless of score. Tailored CVs and cover letters are generated from confirmed facts with source references and are downloadable as DOCX/PDF. The original CV remains unchanged; generated documents use a clean layout rather than preserving the uploaded layout. Hosted-AI privacy review is still required before production use with real profile facts.

### 5. Dashboard and Telegram review

- Build dashboard views for search runs, all scored jobs, job details, match reasons, warnings, and document preview/download.
- Add save, dismiss, and applied status actions and prevent the same source job from repeatedly appearing as new.
- Link Telegram securely to the owner account.
- Support search commands, manual job import, match review, status actions, and links/files in the bot.
- Provide recoverable states for empty searches, inaccessible listings, timeouts, and partial stage failures.

**Exit criteria:** the owner can complete the search-to-review flow from either surface, then open the source listing and apply manually.

### 6. Production readiness

- Deploy the web application, API, and worker online with HTTPS and managed secrets.
- Add operational logs and alerts for failed search runs, file processing, AI calls, and bot/API availability; do not log CV contents or credentials.
- Configure backups, retention/deletion behavior, rate limits, and a documented recovery process.
- Review accessibility, security, privacy, and platform API terms before launch.

**Exit criteria:** a production deployment is usable by the owner, failures are visible, and stored CV data can be deleted.

## Initial acceptance criteria

- Only the owner can access the dashboard and stored CVs.
- No automated scraping or application submission occurs.
- `/site` and `/remote` use the agreed Nigerian locations and eligibility.
- Every scored job remains visible with its 1.0–5.0 rating, including scores below 4; uncertain results remain visible with warnings.
- All tailored claims trace back to confirmed CV facts; original CV files are never overwritten.
- Jobs can be reviewed in the dashboard and Telegram and marked saved, dismissed, or applied.
- Search and generation failures do not silently discard run status or misrepresent a job as fully processed.

## Open decisions and risks

- LinkedIn permitted discovery coverage and Upwork API approval/scope may limit automated search; manual import is the agreed fallback.
- `/site` uses Tavily's last-week filter; an exact last-hour-only search is not available through this provider. Published dates are estimates and may reflect a page update, so the owner must confirm the posting date and on-site status on the source page. Search spend and result quality need validation.
- Production AI approval is pending review of NVIDIA Build's applicable data-processing, retention, and training-use terms; a monthly cost ceiling is also not chosen.
- Production private object storage, hosting, and queue technology are not chosen. Local CV storage is for development only.
- Exact scoring rubric and CV layout fidelity need validation against real sample listings and CV files.
- Search rate limits, retry policies, and supported file-size limits must follow the selected providers.

## Version references checked 2026-11-07

- Proposed baseline: Python 3.14.10, FastAPI 0.162.0, Next.js 16.4.x / App Router, Node.js 20.9 or newer, Neon PostgreSQL 18. Pin exact patch versions and recheck provider compatibility when implementation starts.
- [Python 3.14.10](https://www.python.org/downloads/release/python-31410/)
- [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/)
- [Next.js release log](https://nextjs.org/blog) and [support policy](https://nextjs.org/support-policy)
- [Neon supported Postgres versions](https://api-docs.neon.tech/reference/createproject)
