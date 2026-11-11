# Job Hunter API

## Local development

From this directory, sync the uv environment, apply the database migration, and start the development server:

```powershell
uv sync
uv run --env-file .env alembic upgrade head
uv run --env-file .env uvicorn api.main:app --reload
```

Keep `DATABASE_URL` in the local `.env` file. Use `.env.example` as a variable-name reference; never commit credentials.

## Owner sign-in setup

The dashboard has one configured owner. Before starting the API, set `OWNER_EMAIL`,
`OWNER_PASSWORD_HASH`, and `SESSION_SECRET` in `apps/api/.env`. Generate the latter
two values interactively (the password is never written to a file) with:

```powershell
uv run python scripts/create_auth_values.py
```

Copy its two output lines into `.env`, then add your email as `OWNER_EMAIL`. Keep the
single quotes around `OWNER_PASSWORD_HASH`: its Argon2 value contains `$` characters,
which `uv --env-file` would otherwise interpret. Sessions are signed, HTTP-only browser
cookies managed by the web app and expire after 24 hours by default. Set `SESSION_HOURS`
to choose an expiry between 1 and 168 hours.

- Liveness: `GET http://127.0.0.1:8000/health`
- Database readiness: `GET http://127.0.0.1:8000/ready`
- Interactive API docs: `http://127.0.0.1:8000/docs`
- Sign in: `POST /api/v1/auth/login`
- Check an authenticated session: `GET /api/v1/auth/session`
- Preview without saving: `POST /api/v1/jobs/preview`
- Import and persist a listing: `POST /api/v1/jobs/import`
- Discover Remote OK listings: `GET /api/v1/jobs/discover/remoteok?q=python&limit=50`
- Search and record a Remote OK query: `POST /api/v1/jobs/discover/remoteok/search` with `{"query":"python"}`
- List the 10 most recent Remote OK searches: `GET /api/v1/jobs/discover/remoteok/history?limit=10`
- List saved listings: `GET /api/v1/jobs`
- Request an AI match assessment: `POST /api/v1/jobs/{job_id}/score`
- Generate/retrieve tailored application materials: `POST /api/v1/jobs/{job_id}/tailor` and `GET /api/v1/jobs/{job_id}/materials`
- Download a tailored CV or cover letter as DOCX/PDF: `GET /api/v1/jobs/{job_id}/materials/{cv|cover-letter}/{docx|pdf}`
- Update status: `PATCH /api/v1/jobs/{job_id}/status` with `{"status":"saved"}`, `{"status":"dismissed"}`, or `{"status":"applied"}`
- Save application dates and notes: `PATCH /api/v1/jobs/{job_id}/follow-up`

The import endpoint stores only information the user supplies; it does not fetch job URLs or scrape platforms. Remote OK discovery is a separate, authenticated read-only endpoint backed by its public JSON feed. The feed is cached in memory for 15 minutes, and selected listings are saved through the existing import endpoint. The dashboard links back to Remote OK and identifies it as the source. AI matching is an explicit per-job request, and results are saved so refreshing the dashboard does not repeat provider calls. Listings with the same source and normalized URL are deduplicated. Jobs without a URL can be imported as separate records.

Remote OK searches from the dashboard are stored as a recent-search history with the query, time, result count, and success/failure status. The history stores search metadata only, not job listing contents. The API's read-only `GET /discover/remoteok` endpoint remains available without recording a search.

## AI job matching

NVIDIA Build is the configured provider. Set `AI_API_KEY` in `apps/api/.env`; the NVIDIA-compatible base URL and model defaults are in `.env.example` and can be overridden with `AI_BASE_URL` and `AI_MODEL`. The score button appears on each job card after a profile is confirmed. Match ratings use a 1.0–5.0 scale in tenths, and every scored job remains visible, including ratings below 4. The scoring request sends candidate skills, summary, experience, and education plus the job details, but not direct identifiers or the raw CV. Review NVIDIA's data-retention terms before sending real profile information to the hosted service.

## Tailored application materials

From a job card, choose **Tailor CV with AI**. The API sends the confirmed profile's summary, skills, experience, and education plus the selected job description to the configured AI provider. It does not send the uploaded file or the profile's name, email, or phone fields. Each generated claim must cite an indexed profile fact; the dashboard displays those source facts next to the draft for review. The generated CV and cover letter are available as DOCX and PDF in a clean layout. The original upload is unchanged. Materials are stored as structured text linked to the job and confirmed CV; replacing or deleting the CV invalidates or removes its generated materials. Review all AI content before applying, and check the provider's retention terms before sending real profile data.

After deploying this version, apply the migration with `uv run --env-file .env alembic upgrade head`.

## Telegram bot

Create a bot with Telegram's `@BotFather`, copy its token into `TELEGRAM_BOT_TOKEN` in `apps/api/.env`, and keep that token private. Apply the current migrations, sign in to the dashboard, choose **Connect Telegram**, generate a code, then send `/start CODE` to your bot in a private chat. Link codes expire after 10 minutes and are one-use. Start the polling worker in a separate terminal from `apps/api`:

```powershell
uv run --env-file .env python -m api.telegram_bot
```

The bot supports `/jobs`, `/remote <keywords>`, `/site [keywords]`, `/status <job-id-prefix> <new|saved|dismissed|applied>`, `/followup <job-id-prefix> <YYYY-MM-DD|->`, `/note <job-id-prefix> | <text or ->`, and `/import <URL or -> | <title> | <company> | <description>`. `/remote` searches the cached Remote OK feed. For `/site`, NVIDIA AI formulates a search query, calls the backend's bounded Tavily Search tool for dated listings in Abuja, Lagos, Port Harcourt, Enugu, and Benue State, then reviews the returned results. It searches the last 7 days, saves matching source links and short excerpts, skips duplicate URLs, and records the search run. Change `SITE_LOOKBACK_DAYS` in `src/api/services/site_jobs.py` to adjust the date window. `/site` requires both `AI_API_KEY` and `TAVILY_API_KEY` in `apps/api/.env`; it makes one Tavily search per target location and two NVIDIA AI calls (query planning and result review) when dated results are found. Run `/site` without keywords to search general IT jobs, including software, IT support, systems and networks, cybersecurity, data, and cloud roles; add keywords to narrow the search. The provider's published date is an estimate and may reflect a page update. Results marked fresh are estimated to be within an hour; other results are estimated to be within 7 days. Confirm the posting date and work mode on the source page. LinkedIn and Upwork are excluded from this automated search. Marking a job applied records today's date; use `/followup` to set or clear a reminder date and `/note` for private application notes. Run only one polling worker for a bot token. The bot only responds to private chats; unlink it from the dashboard or send `/unlink`.

## CV onboarding

Authenticated profile endpoints:

- `GET /api/v1/profile/onboarding` — current original CV metadata and draft/confirmed facts
- `GET /api/v1/profile/status` — whether the owner needs to upload, review, or has confirmed a profile
- `POST /api/v1/profile/cv` — upload one PDF or DOCX (up to 10 MB) as multipart field `file`
- `PUT /api/v1/profile/confirm` — save reviewed facts with the current `cv_document_id`
- `DELETE /api/v1/profile/cv` — delete the source CV and the profile derived from it

Local originals are stored outside the web app in `apps/api/.local-data/cvs` by default. Set
`CV_STORAGE_DIR` to a private directory when deploying. The database stores extracted text,
the editable draft, and file metadata; it does not store the uploaded file bytes. Only text-based
PDFs and DOCX files are supported; scanned PDFs need OCR, which is not included yet. After
updating the API, apply the new migration with `uv run --env-file .env alembic upgrade head`.

Set `WEB_ORIGIN` to the deployed dashboard origin when running outside local development. It defaults to `http://localhost:3000`.
