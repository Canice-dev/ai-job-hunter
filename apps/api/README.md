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
- List saved listings: `GET /api/v1/jobs`
- Request an AI match assessment: `POST /api/v1/jobs/{job_id}/score`
- Update status: `PATCH /api/v1/jobs/{job_id}/status` with `{"status":"saved"}`, `{"status":"dismissed"}`, or `{"status":"applied"}`
- Save application dates and notes: `PATCH /api/v1/jobs/{job_id}/follow-up`

The import endpoint stores only information the user supplies; it does not fetch job URLs or scrape platforms. AI matching is an explicit per-job request, and results are saved so refreshing the dashboard does not repeat provider calls. Listings with the same source and normalized URL are deduplicated. Jobs without a URL can be imported as separate records.

## AI job matching

Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey) and put it in `AI_API_KEY` in `apps/api/.env`. The defaults use Gemini's OpenAI-compatible chat API and `gemini-3.8-flash`; `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` can be changed to switch providers. The score button appears on each job card after a profile is confirmed. Applying the migration adds cached assessment fields to existing job records. The scoring request sends the candidate's skills, summary, experience, and education plus the job details, but not direct identifiers or the raw CV. Google's unpaid Gemini API terms permit submitted content to be used to improve products and reviewed, and say not to submit personal information. Use synthetic profile data for free-tier testing; do not send a real candidate profile unless you have reviewed the terms and chosen an appropriate paid/privacy arrangement.

## Telegram bot

Create a bot with Telegram's `@BotFather`, copy its token into `TELEGRAM_BOT_TOKEN` in `apps/api/.env`, and keep that token private. Apply the current migrations, sign in to the dashboard, choose **Connect Telegram**, generate a code, then send `/start CODE` to your bot in a private chat. Link codes expire after 10 minutes and are one-use. Start the polling worker in a separate terminal from `apps/api`:

```powershell
uv run --env-file .env python -m api.telegram_bot
```

The bot supports `/jobs`, `/status <job-id-prefix> <new|saved|dismissed|applied>`, `/followup <job-id-prefix> <YYYY-MM-DD|->`, `/note <job-id-prefix> | <text or ->`, and `/import <URL or -> | <title> | <company> | <description>`. Marking a job applied records today's date; use `/followup` to set or clear a reminder date and `/note` for private application notes. `/site` and `/remote` explain that automated search is not connected yet. Run only one polling worker for a bot token. The bot only responds to private chats; unlink it from the dashboard or send `/unlink`.

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
