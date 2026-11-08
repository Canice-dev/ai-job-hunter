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
- Update status: `PATCH /api/v1/jobs/{job_id}/status` with `{"status":"saved"}`, `{"status":"dismissed"}`, or `{"status":"applied"}`

The import endpoint stores only information the user supplies; it does not fetch job URLs, scrape platforms, score listings, or generate application materials. Listings with the same source and normalized URL are deduplicated. Jobs without a URL can be imported as separate records.

Set `WEB_ORIGIN` to the deployed dashboard origin when running outside local development. It defaults to `http://localhost:3000`.
