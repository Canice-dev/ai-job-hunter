# Job Hunter API

## Local development

From this directory, sync the uv environment, apply the database migration, and start the development server:

```powershell
uv sync
uv run --env-file .env alembic upgrade head
uv run --env-file .env uvicorn api.main:app --reload
```

Keep `DATABASE_URL` in the local `.env` file. Use `.env.example` as a variable-name reference; never commit credentials.

- Liveness: `GET http://127.0.0.1:8000/health`
- Database readiness: `GET http://127.0.0.1:8000/ready`
- Interactive API docs: `http://127.0.0.1:8000/docs`
- Preview without saving: `POST /api/v1/jobs/preview`
- Import and persist a listing: `POST /api/v1/jobs/import`
- List saved listings: `GET /api/v1/jobs`
- Update status: `PATCH /api/v1/jobs/{job_id}/status` with `{"status":"saved"}`, `{"status":"dismissed"}`, or `{"status":"applied"}`

The import endpoint stores only information the user supplies; it does not fetch job URLs, scrape platforms, score listings, or generate application materials. Listings with the same source and normalized URL are deduplicated. Jobs without a URL can be imported as separate records.

Set `WEB_ORIGIN` to the deployed dashboard origin when running outside local development. It defaults to `http://localhost:3000`.
