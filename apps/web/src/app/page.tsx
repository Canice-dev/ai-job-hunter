"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ProfileOnboarding from "@/app/profile-onboarding";

type JobStatus = "new" | "saved" | "dismissed" | "applied";
type JobSource = "linkedin" | "upwork" | "manual";
type WorkMode = "on_site" | "remote" | "hybrid" | "unknown";

type Job = {
  id: string;
  source: JobSource;
  source_url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  work_mode: WorkMode;
  description: string;
  status: JobStatus;
  match_score: number | null;
  match_summary: string | null;
  match_strengths: string[];
  match_gaps: string[];
  match_scored_at: string | null;
  created_at: string;
  updated_at: string;
};

type JobImportResponse = { job: Job; created: boolean };
type Filter = "all" | JobStatus;
type AuthState = "checking" | "signed_out" | "onboarding" | "signed_in";
type SessionResponse = { email: string };
type ProfileStatus = { status: "missing" | "draft" | "confirmed"; full_name?: string | null };
type TelegramStatus = { linked: boolean; linked_at: string | null };

const DASHBOARD_API = "/api/backend";

const statusLabels: Record<JobStatus, string> = {
  new: "New",
  saved: "Saved",
  dismissed: "Dismissed",
  applied: "Applied",
};

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

async function responseError(response: Response) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail))
      return body.detail
        .map((item: { msg?: string }) => item.msg)
        .filter(Boolean)
        .join(" ");
  } catch {
    // The server may return an empty or non-JSON error response.
  }
  return `The API returned ${response.status}. Please try again.`;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [manageProfile, setManageProfile] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [telegramPanelOpen, setTelegramPanelOpen] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState("");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const response = await fetch(`${DASHBOARD_API}/jobs?limit=200`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        setAuthState("signed_out");
        setJobs([]);
        return;
      }
      if (!response.ok) throw new Error(await responseError(response));
      setJobs((await response.json()) as Job[]);
    } catch (error) {
      setPageError(
        error instanceof TypeError
          ? "Could not reach the API. Make sure the Python server is running, then refresh."
          : error instanceof Error
            ? error.message
            : "Could not load your jobs. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializeDashboard() {
      try {
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (sessionResponse.status === 401) {
          if (!cancelled) setAuthState("signed_out");
          return;
        }
        if (!sessionResponse.ok) {
          throw new Error(await responseError(sessionResponse));
        }

        const session = (await sessionResponse.json()) as SessionResponse;
        const profileResponse = await fetch(`${DASHBOARD_API}/profile/status`, {
          cache: "no-store",
        });
        if (profileResponse.status === 401) {
          if (!cancelled) setAuthState("signed_out");
          return;
        }
        if (!profileResponse.ok) throw new Error(await responseError(profileResponse));
        const profileStatus = (await profileResponse.json()) as ProfileStatus;
        if (profileStatus.status !== "confirmed") {
          if (!cancelled) {
            setOwnerEmail(session.email);
            setAuthState("onboarding");
          }
          return;
        }

        const jobsResponse = await fetch(`${DASHBOARD_API}/jobs?limit=200`, {
          cache: "no-store",
        });
        if (jobsResponse.status === 401) {
          if (!cancelled) setAuthState("signed_out");
          return;
        }
        if (!jobsResponse.ok) throw new Error(await responseError(jobsResponse));

        const initialJobs = (await jobsResponse.json()) as Job[];
        if (!cancelled) {
          setOwnerEmail(session.email);
          setJobs(initialJobs);
          setAuthState("signed_in");
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(
            error instanceof TypeError
              ? "Could not reach the API. Make sure the Python server is running, then refresh."
              : error instanceof Error
                ? error.message
                : "Could not check your sign-in session. Please try again.",
          );
          setAuthState("signed_out");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initializeDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await responseError(response));

      setOwnerEmail(email);
      const profileResponse = await fetch(`${DASHBOARD_API}/profile/status`, {
        cache: "no-store",
      });
      if (!profileResponse.ok) throw new Error(await responseError(profileResponse));
      const profileStatus = (await profileResponse.json()) as ProfileStatus;
      if (profileStatus.status !== "confirmed") {
        setAuthState("onboarding");
      } else {
        setAuthState("signed_in");
        await loadJobs();
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Could not sign in. Please try again.",
      );
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setJobs([]);
      setOwnerEmail("");
      setPageError("");
      setNotice("");
      setFormOpen(false);
      setAuthState("signed_out");
    }
  }

  const counts = useMemo(() => {
    const total = jobs.length;
    const saved = jobs.filter((job) => job.status === "saved").length;
    const applied = jobs.filter((job) => job.status === "applied").length;
    const active = jobs.filter((job) => job.status !== "dismissed").length;
    return { total, saved, applied, active };
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesFilter = filter === "all" || job.status === filter;
      const matchesSearch =
        !query ||
        [job.title, job.company, job.location, job.description, job.source]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
      return matchesFilter && matchesSearch;
    });
  }, [filter, jobs, search]);

  async function importJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setPageError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = {
      source: form.get("source"),
      source_url: (form.get("source_url") as string).trim() || null,
      title: (form.get("title") as string).trim() || null,
      company: (form.get("company") as string).trim() || null,
      location: (form.get("location") as string).trim() || null,
      work_mode: form.get("work_mode"),
      description: (form.get("description") as string).trim(),
    };

    try {
      const response = await fetch(`${DASHBOARD_API}/jobs/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as JobImportResponse;
      setJobs((current) => [
        result.job,
        ...current.filter((job) => job.id !== result.job.id),
      ]);
      setNotice(
        result.created
          ? "Job added to your list."
          : "This job was already in your list. Showing the existing entry.",
      );
      setFormOpen(false);
      event.currentTarget.reset();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Could not import the job. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(jobId: string, status: JobStatus) {
    setUpdatingId(jobId);
    setPageError("");
    try {
      const response = await fetch(`${DASHBOARD_API}/jobs/${jobId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const updated = (await response.json()) as Job;
      setJobs((current) =>
        current.map((job) => (job.id === jobId ? updated : job)),
      );
      setNotice(`Job marked ${statusLabels[status].toLowerCase()}.`);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Could not update this job.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function scoreJob(jobId: string) {
    setScoringId(jobId);
    setPageError("");
    try {
      const response = await fetch(`${DASHBOARD_API}/jobs/${jobId}/score`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await responseError(response));
      const updated = (await response.json()) as Job;
      setJobs((current) =>
        current.map((job) => (job.id === jobId ? updated : job)),
      );
      setNotice("AI job assessment is ready.");
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Could not score this job.",
      );
    } finally {
      setScoringId(null);
    }
  }

  async function openTelegramPanel() {
    const opening = !telegramPanelOpen;
    setTelegramPanelOpen(opening);
    setTelegramError("");
    if (!opening) return;
    setTelegramBusy(true);
    try {
      const response = await fetch(`${DASHBOARD_API}/telegram/status`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      setTelegramStatus((await response.json()) as TelegramStatus);
    } catch (error) {
      setTelegramError(error instanceof Error ? error.message : "Could not check Telegram link status.");
    } finally {
      setTelegramBusy(false);
    }
  }

  async function createTelegramCode() {
    setTelegramBusy(true);
    setTelegramError("");
    setTelegramCode("");
    try {
      const response = await fetch(`${DASHBOARD_API}/telegram/link-code`, { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as { code: string; expires_at: string };
      setTelegramCode(result.code);
      setNotice(`Link code expires at ${new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(new Date(result.expires_at))}.`);
    } catch (error) {
      setTelegramError(error instanceof Error ? error.message : "Could not create a Telegram link code.");
    } finally {
      setTelegramBusy(false);
    }
  }

  async function unlinkTelegram() {
    setTelegramBusy(true);
    setTelegramError("");
    try {
      const response = await fetch(`${DASHBOARD_API}/telegram/link`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setTelegramStatus({ linked: false, linked_at: null });
      setTelegramCode("");
      setNotice("Telegram was unlinked.");
    } catch (error) {
      setTelegramError(error instanceof Error ? error.message : "Could not unlink Telegram.");
    } finally {
      setTelegramBusy(false);
    }
  }

  if (authState !== "signed_in") {
    if (authState === "onboarding") {
      return (
        <ProfileOnboarding
          onConfirmed={() => {
            setAuthState("signed_in");
            void loadJobs();
          }}
          onDeleted={() => setAuthState("onboarding")}
        />
      );
    }
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="sign-in-title">
          <a className="auth-brand" href="#sign-in-title" aria-label="Job Hunter sign in">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span>job<span className="brand-light">hunter</span></span>
          </a>

          {authState === "checking" ? (
            <div className="auth-loading" role="status">
              <span className="loading-ring" />
              Checking your workspace…
            </div>
          ) : (
            <>
              <div className="auth-heading">
                <p className="eyebrow">PRIVATE WORKSPACE</p>
                <h1 id="sign-in-title">Welcome back</h1>
                <p>Sign in to access your jobs, CV details, and application materials.</p>
              </div>

              <form className="auth-form" onSubmit={signIn}>
                <label>
                  Email address
                  <input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
                </label>
                <label>
                  Password
                  <input name="password" type="password" autoComplete="current-password" required />
                </label>
                {authError && <p className="auth-error" role="alert">{authError}</p>}
                <button className="primary-button auth-submit" type="submit" disabled={authSubmitting}>
                  {authSubmitting ? <><span className="button-spinner" />Signing in…</> : "Sign in"}
                </button>
              </form>

              <p className="auth-note">This personal workspace has one configured owner account.</p>
            </>
          )}
        </section>
      </main>
    );
  }

  const ownerInitial = ownerEmail.slice(0, 1).toUpperCase() || "O";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Job Hunter home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>
            job<span className="brand-light">hunter</span>
          </span>
        </a>

        <div className="sidebar-label">Workspace</div>
        <nav className="side-nav" aria-label="Main navigation">
          <a className="nav-item active" href="#jobs">
            <span className="nav-icon grid-icon" aria-hidden="true" />
            Overview
          </a>
          <a
            className="nav-item"
            href="#jobs"
            onClick={() => setFilter("saved")}
          >
            <span className="nav-icon bookmark-icon" aria-hidden="true" />
            Saved jobs
          </a>
          <a
            className="nav-item"
            href="#jobs"
            onClick={() => setFilter("applied")}
          >
            <span className="nav-icon send-icon" aria-hidden="true" />
            Applications
          </a>
          <button className="nav-item profile-nav-item" onClick={() => setManageProfile((value) => !value)}>
            <span className="nav-icon profile-icon" aria-hidden="true" />
            My profile
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="assistant-card">
            <span className="assistant-spark" aria-hidden="true">
              ✳
            </span>
            <div>
              <strong>Your job search, in one place.</strong>
              <p>Save roles here to keep your search organized.</p>
            </div>
          </div>
          <div className="profile-row">
            <div className="avatar">{ownerInitial}</div>
            <div className="profile-copy">
              <strong>{ownerEmail}</strong>
              <span>Personal account</span>
            </div>
            <button className="sign-out-button" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </aside>

      <section className="main-panel" id="top">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="crumb-divider">/</span>
            <strong>Overview</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <span />
              API connected
            </span>
            <button className="top-avatar" onClick={() => void signOut()} aria-label="Sign out">
              {ownerInitial}
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {manageProfile && (
            <ProfileOnboarding
              onClose={() => setManageProfile(false)}
              onConfirmed={() => undefined}
              onDeleted={() => {
                setManageProfile(false);
                setAuthState("onboarding");
                setJobs([]);
              }}
            />
          )}
          <section className="welcome-row">
            <div>
              <p className="eyebrow">YOUR CAREER, IN MOTION</p>
              <h1>Job search overview</h1>
              <p className="welcome-subtitle">
                A clear view of the opportunities you’re tracking.
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setFormOpen((open) => !open);
                setNotice("");
              }}
            >
              <span className="plus-icon" aria-hidden="true">
                +
              </span>
              {formOpen ? "Close form" : "Add a job"}
            </button>
          </section>

          <section className="telegram-connection" aria-labelledby="telegram-title">
            <div className="telegram-connection-heading">
              <div>
                <p className="eyebrow">OPTIONAL</p>
                <h2 id="telegram-title">Telegram bot</h2>
                <p>Review your saved jobs and update their status from a private Telegram chat.</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => void openTelegramPanel()}>
                {telegramPanelOpen ? "Close" : "Connect Telegram"}
              </button>
            </div>
            {telegramPanelOpen && (
              <div className="telegram-connection-body">
                {telegramBusy && !telegramStatus ? <p>Checking link status…</p> : null}
                {telegramStatus?.linked ? (
                  <>
                    <p>Telegram is linked to this account.</p>
                    <button className="text-button" type="button" disabled={telegramBusy} onClick={() => void unlinkTelegram()}>
                      {telegramBusy ? "Unlinking…" : "Unlink Telegram"}
                    </button>
                  </>
                ) : (
                  <>
                    <p>Create a one-time code, then send <code>/start YOUR_CODE</code> to your bot in a private chat. The code expires after 10 minutes.</p>
                    {telegramCode && <p className="telegram-code" aria-live="polite">{telegramCode}</p>}
                    <button className="secondary-button" type="button" disabled={telegramBusy} onClick={() => void createTelegramCode()}>
                      {telegramBusy ? "Working…" : telegramCode ? "Create another code" : "Generate link code"}
                    </button>
                  </>
                )}
                {telegramError && <p className="telegram-error" role="alert">{telegramError}</p>}
              </div>
            )}
          </section>

          <section className="stats-grid" aria-label="Job search summary">
            <article className="stat-card stat-total">
              <div className="stat-top">
                <span>Total tracked</span>
                <span className="stat-icon total-icon" aria-hidden="true">
                  ↗
                </span>
              </div>
              <strong>{counts.total}</strong>
              <small>Roles in your workspace</small>
            </article>
            <article className="stat-card">
              <div className="stat-top">
                <span>Active roles</span>
                <span className="stat-icon active-icon" aria-hidden="true">
                  ◌
                </span>
              </div>
              <strong>{counts.active}</strong>
              <small>Not dismissed</small>
            </article>
            <article className="stat-card">
              <div className="stat-top">
                <span>Saved</span>
                <span className="stat-icon saved-icon" aria-hidden="true">
                  ♡
                </span>
              </div>
              <strong>{counts.saved}</strong>
              <small>Worth a closer look</small>
            </article>
            <article className="stat-card">
              <div className="stat-top">
                <span>Applied</span>
                <span className="stat-icon applied-icon" aria-hidden="true">
                  ↗
                </span>
              </div>
              <strong>{counts.applied}</strong>
              <small>Applications you’ve sent</small>
            </article>
          </section>

          {formOpen && (
            <section className="form-panel" aria-labelledby="form-title">
              <div className="form-heading">
                <div>
                  <p className="eyebrow">MANUAL IMPORT</p>
                  <h2 id="form-title">Add a job to your list</h2>
                  <p>
                    Paste the details you want to keep. We won’t fetch or submit
                    anything.
                  </p>
                </div>
                <button
                  className="icon-button close-button"
                  onClick={() => setFormOpen(false)}
                  aria-label="Close form"
                >
                  ×
                </button>
              </div>
              <form className="job-form" onSubmit={importJob}>
                <label>
                  Job title
                  <input
                    name="title"
                    placeholder="e.g. Backend Engineer"
                    maxLength={300}
                  />
                </label>
                <label>
                  Company
                  <input
                    name="company"
                    placeholder="e.g. Acme Inc."
                    maxLength={300}
                  />
                </label>
                <label>
                  Source
                  <select name="source" defaultValue="manual">
                    <option value="manual">Manual</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="upwork">Upwork</option>
                  </select>
                </label>
                <label>
                  Work mode
                  <select name="work_mode" defaultValue="unknown">
                    <option value="unknown">Not specified</option>
                    <option value="remote">Remote</option>
                    <option value="on_site">On-site</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </label>
                <label>
                  Location
                  <input
                    name="location"
                    placeholder="e.g. Lagos or Remote"
                    maxLength={300}
                  />
                </label>
                <label>
                  Job listing URL
                  <input
                    name="source_url"
                    type="url"
                    placeholder="https://..."
                  />
                </label>
                <label className="description-field">
                  Job description
                  <textarea
                    name="description"
                    placeholder="Paste the job description here…"
                    required
                    maxLength={50000}
                    rows={5}
                  />
                </label>
                <div className="form-actions">
                  <span>Required: job description</span>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <span className="button-spinner" />
                        Adding…
                      </>
                    ) : (
                      "Add job"
                    )}
                  </button>
                </div>
              </form>
            </section>
          )}

          {pageError && (
            <div className="message-banner error-banner" role="alert">
              <span className="message-symbol">!</span>
              <span>{pageError}</span>
              <button onClick={() => void loadJobs()}>Retry</button>
            </div>
          )}
          {notice && !pageError && (
            <div className="message-banner success-banner" role="status">
              <span className="message-symbol">✓</span>
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">
                ×
              </button>
            </div>
          )}

          <section className="jobs-section" id="jobs">
            <div className="jobs-heading">
              <div>
                <h2>Your opportunities</h2>
                <p>Keep every role and next step in view.</p>
              </div>
              <button
                className="refresh-button"
                onClick={() => void loadJobs()}
                disabled={loading}
              >
                <span
                  className={
                    loading ? "refresh-glyph is-loading" : "refresh-glyph"
                  }
                  aria-hidden="true"
                >
                  ↻
                </span>
                Refresh
              </button>
            </div>

            <div className="jobs-toolbar">
              <div
                className="filter-tabs"
                role="tablist"
                aria-label="Filter jobs"
              >
                {(
                  ["all", "new", "saved", "applied", "dismissed"] as Filter[]
                ).map((item) => (
                  <button
                    key={item}
                    role="tab"
                    aria-selected={filter === item}
                    className={
                      filter === item ? "filter-tab selected" : "filter-tab"
                    }
                    onClick={() => setFilter(item)}
                  >
                    {item === "all" ? "All jobs" : statusLabels[item]}
                  </button>
                ))}
              </div>
              <label className="search-box">
                <span className="search-icon" aria-hidden="true" />
                <span className="sr-only">Search jobs</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search jobs"
                />
              </label>
            </div>

            <div className="jobs-list">
              {loading ? (
                <div className="list-message">
                  <span className="loading-ring" />
                  Loading your jobs…
                </div>
              ) : visibleJobs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-illustration">
                    <span className="empty-sheet" />
                    <span className="empty-spark">✳</span>
                  </div>
                  <h3>
                    {jobs.length === 0
                      ? "Your next opportunity starts here"
                      : "No jobs match this view"}
                  </h3>
                  <p>
                    {jobs.length === 0
                      ? "Add a listing you found and keep its details and application status together."
                      : "Try another status filter or search term."}
                  </p>
                  {jobs.length === 0 && (
                    <button
                      className="secondary-button"
                      onClick={() => setFormOpen(true)}
                    >
                      Add your first job <span>↗</span>
                    </button>
                  )}
                </div>
              ) : (
                visibleJobs.map((job) => (
                  <article className="job-card" key={job.id}>
                    <div className="company-mark" aria-hidden="true">
                      {(job.company || job.source).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="job-main">
                      <div className="job-title-row">
                        <h3>{job.title || "Untitled role"}</h3>
                        {job.source_url && (
                          <a
                            className="external-link"
                            href={job.source_url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open original listing"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                      <div className="company-line">
                        <span>{job.company || "Company not specified"}</span>
                        <span className="meta-dot">·</span>
                        <span>{job.location || "Location not specified"}</span>
                      </div>
                      <div className="job-tags">
                        <span className={`status-pill status-${job.status}`}>
                          {statusLabels[job.status]}
                        </span>
                        {job.match_score !== null && (
                          <span className="match-score">{job.match_score}% AI match</span>
                        )}
                        <button
                          className="score-button"
                          type="button"
                          disabled={scoringId !== null}
                          onClick={() => void scoreJob(job.id)}
                        >
                          {scoringId === job.id
                            ? "Scoring…"
                            : job.match_score === null
                              ? "Score with AI"
                              : "Re-score"}
                        </button>
                        <span className="source-tag">
                          {humanize(job.source)}
                        </span>
                        <span className="work-tag">
                          {humanize(job.work_mode)}
                        </span>
                      </div>
                    </div>
                    <div className="job-side">
                      <span className="job-date">
                        Added {dateLabel(job.created_at)}
                      </span>
                      <label className="status-control">
                        <span className="sr-only">Update job status</span>
                        <select
                          value={job.status}
                          disabled={updatingId === job.id}
                          onChange={(event) =>
                            void updateStatus(
                              job.id,
                              event.target.value as JobStatus,
                            )
                          }
                        >
                          <option value="new">New</option>
                          <option value="saved">Saved</option>
                          <option value="applied">Applied</option>
                          <option value="dismissed">Dismissed</option>
                        </select>
                      </label>
                    </div>
                    <details className="job-description">
                      <summary>View description</summary>
                      <p>{job.description}</p>
                    </details>
                    {job.match_summary && (
                      <details className="match-details">
                        <summary>AI assessment</summary>
                        <p>{job.match_summary}</p>
                        {job.match_strengths.length > 0 && (
                          <p><strong>Strengths:</strong> {job.match_strengths.join(" · ")}</p>
                        )}
                        {job.match_gaps.length > 0 && (
                          <p><strong>Gaps to consider:</strong> {job.match_gaps.join(" · ")}</p>
                        )}
                      </details>
                    )}
                  </article>
                ))
              )}
            </div>
            {!loading && visibleJobs.length > 0 && (
              <div className="list-footer">
                Showing {visibleJobs.length} of {jobs.length} tracked{" "}
                {jobs.length === 1 ? "role" : "roles"}
                <span>Synced with your database</span>
              </div>
            )}
          </section>
          <footer className="page-footer">
            <span>Made for a more focused job search.</span>
            <span>
              Job Hunter <span className="footer-dot">·</span> Personal
              workspace
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}
