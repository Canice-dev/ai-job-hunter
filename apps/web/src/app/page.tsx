"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Menu, PanelLeftOpen, Plus, Search, X } from "lucide-react";
import ProfileOnboarding from "@/app/profile-onboarding";
import AppSidebar, { type DashboardPage } from "@/components/app-sidebar";

type JobStatus = "new" | "saved" | "dismissed" | "applied";
type JobSource = "linkedin" | "upwork" | "remoteok" | "manual";
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
  applied_date: string | null;
  notes: string | null;
  follow_up_date: string | null;
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
type RemoteOKListing = {
  id: string;
  title: string;
  company: string;
  location: string;
  tags: string[];
  description: string;
  url: string;
  published_at: string | null;
};

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

function JobFollowUp({
  job,
  saving,
  onSave,
}: {
  job: Job;
  saving: boolean;
  onSave: (jobId: string, appliedDate: string, notes: string, followUpDate: string) => void;
}) {
  const [appliedDate, setAppliedDate] = useState(job.applied_date || "");
  const [notes, setNotes] = useState(job.notes || "");
  const [followUpDate, setFollowUpDate] = useState(job.follow_up_date || "");

  return (
    <details className="follow-up-editor">
      <summary>Application follow-up</summary>
      <div className="follow-up-fields">
        <label>
          Applied date
          <input type="date" value={appliedDate} onChange={(event) => setAppliedDate(event.target.value)} />
        </label>
        <label>
          Next follow-up
          <input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
        </label>
        <label className="follow-up-notes">
          Private notes
          <textarea
            value={notes}
            maxLength={5000}
            rows={3}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Recruiter contact, interview notes, or next steps"
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={saving}
          onClick={() => onSave(job.id, appliedDate, notes, followUpDate)}
        >
          {saving ? "Saving…" : "Save follow-up"}
        </button>
      </div>
    </details>
  );
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
  const [savingFollowUpId, setSavingFollowUpId] = useState<string | null>(null);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [telegramPanelOpen, setTelegramPanelOpen] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<DashboardPage>("home");
  const [remoteJobs, setRemoteJobs] = useState<RemoteOKListing[]>([]);
  const [remoteJobCount, setRemoteJobCount] = useState(0);
  const [remoteQuery, setRemoteQuery] = useState("");
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [remoteImportError, setRemoteImportError] = useState("");
  const [importingRemoteJobId, setImportingRemoteJobId] = useState<string | null>(null);

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

  const loadRemoteJobs = useCallback(async (query = "") => {
    setRemoteLoading(true);
    setRemoteError("");
    try {
      const response = await fetch(
        `${DASHBOARD_API}/jobs/discover/remoteok?q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as {
        jobs: RemoteOKListing[];
        count: number;
      };
      setRemoteJobs(result.jobs);
      setRemoteJobCount(result.count);
      setRemoteLoaded(true);
    } catch (error) {
      setRemoteError(
        error instanceof TypeError
          ? "Could not reach the API. Make sure the Python server is running, then try again."
          : error instanceof Error
            ? error.message
            : "Could not load Remote OK jobs. Please try again.",
      );
    } finally {
      setRemoteLoaded(true);
      setRemoteLoading(false);
    }
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

  async function importRemoteJob(listing: RemoteOKListing) {
    setImportingRemoteJobId(listing.id);
    setRemoteImportError("");
    setPageError("");
    setNotice("");
    try {
      const response = await fetch(`${DASHBOARD_API}/jobs/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "remoteok",
          source_url: listing.url,
          title: listing.title,
          company: listing.company,
          location: listing.location,
          work_mode: "remote",
          description: listing.description,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as JobImportResponse;
      setJobs((current) => [
        result.job,
        ...current.filter((job) => job.id !== result.job.id),
      ]);
      setNotice(
        result.created
          ? `${listing.title} added to your jobs.`
          : `${listing.title} is already in your jobs.`,
      );
    } catch (error) {
      setRemoteImportError(
        error instanceof Error
          ? error.message
          : "Could not add this Remote OK listing. Please try again.",
      );
    } finally {
      setImportingRemoteJobId(null);
    }
  }

  function searchRemoteJobs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadRemoteJobs(remoteQuery);
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

  async function updateFollowUp(
    jobId: string,
    appliedDate: string,
    notes: string,
    followUpDate: string,
  ) {
    setSavingFollowUpId(jobId);
    setPageError("");
    try {
      const response = await fetch(`${DASHBOARD_API}/jobs/${jobId}/follow-up`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applied_date: appliedDate || null,
          notes: notes.trim() || null,
          follow_up_date: followUpDate || null,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const updated = (await response.json()) as Job;
      setJobs((current) => current.map((job) => (job.id === jobId ? updated : job)));
      setNotice("Application follow-up saved.");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not save application follow-up.");
    } finally {
      setSavingFollowUpId(null);
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

  return (
    <main className={["app-shell", sidebarCollapsed && "sidebar-collapsed", mobileSidebarOpen && "sidebar-mobile-open"].filter(Boolean).join(" ")}>
      <AppSidebar
        activePage={activePage}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        ownerEmail={ownerEmail}
        telegramLinked={telegramStatus?.linked ?? false}
        onCollapse={() => setSidebarCollapsed(true)}
        onNavigate={(page) => {
          setActivePage(page);
          setMobileSidebarOpen(false);
          setManageProfile(page === "profile");
          if (page === "home") setFilter("all");
          if (page === "saved") setFilter("saved");
          if (page === "applications") setFilter("applied");
          if (page === "discover" && !remoteLoaded && !remoteLoading) {
            void loadRemoteJobs();
          }
          if (page === "telegram" && !telegramPanelOpen) void openTelegramPanel();
        }}
        onSearch={() => document.querySelector<HTMLInputElement>(".search-box input")?.focus()}
        onSignOut={() => void signOut()}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <section className="main-panel" id="top">
        <header className="topbar">
          <button className="sidebar-expand-button" type="button" aria-label="Expand sidebar" onClick={() => setSidebarCollapsed(false)}><PanelLeftOpen size={18} /></button>
          <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={() => setMobileSidebarOpen(true)}><Menu size={19} /></button>
          <a className="mobile-brand" href="#top" aria-label="Job Hunter home"><span className="brand-mark" aria-hidden="true"><span /></span><span>Job Hunter</span></a>
          <button className="topbar-search-button" type="button" aria-label="Search jobs" onClick={() => document.querySelector<HTMLInputElement>(".search-box input")?.focus()}><Search size={18} /></button>
        </header>

        <div className={`content-wrap page-${activePage}`}>
          {manageProfile && (
            <ProfileOnboarding
              onClose={() => { setManageProfile(false); setActivePage("home"); }}
              onConfirmed={() => undefined}
              onDeleted={() => {
                setManageProfile(false);
                setActivePage("home");
                setAuthState("onboarding");
                setJobs([]);
              }}
            />
          )}
          <section className="welcome-row">
            <div>
              <p className="eyebrow">PERSONAL WORKSPACE</p>
              <h1>{activePage === "home" ? "Your job search" : activePage === "discover" ? "Discover jobs" : activePage === "saved" ? "Saved jobs" : activePage === "applications" ? "Applications" : activePage === "profile" ? "My profile" : "Telegram connection"}</h1>
              <p className="welcome-subtitle">
                {activePage === "home"
                  ? "Keep the roles you find, compare your fit, and track the next step."
                  : activePage === "discover"
                    ? "Search remote listings from Remote OK and add the ones worth tracking."
                    : activePage === "saved"
                      ? "Roles you saved to revisit and consider applying to."
                      : activePage === "applications"
                        ? "Track the roles you’ve applied to and the follow-up dates you’ve set."
                        : "Manage your personal job search workspace."}
              </p>
            </div>
            {activePage !== "discover" && (
              <button
                className="primary-button"
                onClick={() => {
                  setFormOpen((open) => !open);
                  setNotice("");
                }}
              >
                {formOpen ? <X size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
                {formOpen ? "Close form" : "Add a job"}
              </button>
            )}
          </section>

          {activePage === "discover" && (
            <section className="remote-discovery" id="discover" aria-labelledby="remote-discovery-title">
              <div className="remote-discovery-heading">
                <div>
                  <p className="eyebrow">REMOTE OK</p>
                  <h2 id="remote-discovery-title">Remote opportunities</h2>
                  <p>Browse remote roles, then add selected listings to your tracker.</p>
                </div>
                <button
                  className="refresh-button"
                  type="button"
                  disabled={remoteLoading}
                  onClick={() => void loadRemoteJobs(remoteQuery)}
                >
                  <span className={remoteLoading ? "refresh-glyph is-loading" : "refresh-glyph"} aria-hidden="true">↻</span>
                  Refresh
                </button>
              </div>

              <form className="remote-search-form" onSubmit={searchRemoteJobs}>
                <label className="search-box">
                  <Search className="search-icon" size={16} aria-hidden="true" />
                  <span className="sr-only">Search Remote OK jobs</span>
                  <input
                    value={remoteQuery}
                    onChange={(event) => setRemoteQuery(event.target.value)}
                    placeholder="Search title, company, skills"
                  />
                </label>
                <button className="primary-button" type="submit" disabled={remoteLoading}>
                  Search jobs
                </button>
              </form>

              <p className="remote-attribution">
                Listings from <a href="https://remoteok.com" target="_blank" rel="noreferrer">Remote OK</a>. Check location eligibility and details on the original listing.
              </p>

              {remoteError && (
                <div className="list-message remote-error" role="alert">
                  <span>{remoteError}</span>
                  <button type="button" onClick={() => void loadRemoteJobs(remoteQuery)}>Try again</button>
                </div>
              )}
              {remoteImportError && <div className="list-message remote-error" role="alert">{remoteImportError}</div>}
              {remoteError ? null : remoteLoading ? (
                <div className="list-message"><span className="loading-ring" />Loading Remote OK jobs…</div>
              ) : remoteJobs.length === 0 && !remoteError ? (
                <div className="empty-state remote-empty-state">
                  <h3>No Remote OK jobs match this search</h3>
                  <p>Try a broader title, company, or skill.</p>
                </div>
              ) : (
                <>
                  <p className="remote-result-count">Showing {remoteJobs.length} of {remoteJobCount} matching listings</p>
                  <div className="remote-job-list">
                    {remoteJobs.map((listing) => {
                      const alreadyAdded = jobs.some(
                        (job) => job.source === "remoteok" && job.source_url === listing.url,
                      );
                      return (
                        <article className="remote-job-card" key={listing.id}>
                          <div className="remote-job-main">
                            <div className="remote-job-title-row">
                              <h3>{listing.title}</h3>
                              <a href={listing.url} target="_blank" rel="noreferrer" aria-label={`View ${listing.title} on Remote OK`}>
                                <ExternalLink size={16} aria-hidden="true" />
                              </a>
                            </div>
                            <p className="remote-job-company">{listing.company} <span>·</span> {listing.location}</p>
                            {listing.published_at && <p className="remote-job-date">Posted {dateLabel(listing.published_at)}</p>}
                            <p className="remote-job-description">{listing.description}</p>
                            <div className="remote-job-tags">
                              {listing.tags.slice(0, 6).map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}
                            </div>
                          </div>
                          <button
                            className="secondary-button remote-import-button"
                            type="button"
                            disabled={alreadyAdded || importingRemoteJobId !== null}
                            onClick={() => void importRemoteJob(listing)}
                          >
                            {importingRemoteJobId === listing.id ? "Adding…" : alreadyAdded ? "In your jobs" : "Add to jobs"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

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
                    <option value="remoteok">Remote OK</option>
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
                <h2>
                  {activePage === "saved"
                    ? "Saved for later"
                    : activePage === "applications"
                      ? "Application tracker"
                      : "Opportunities"}
                </h2>
                <p>
                  {activePage === "saved"
                    ? `${counts.saved} saved ${counts.saved === 1 ? "role" : "roles"} · ${visibleJobs.length} shown`
                    : activePage === "applications"
                      ? `${counts.applied} ${counts.applied === 1 ? "application" : "applications"} tracked · ${visibleJobs.length} shown`
                      : `${visibleJobs.length} ${visibleJobs.length === 1 ? "role" : "roles"} in this view`}
                </p>
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
                <Search className="search-icon" size={16} aria-hidden="true" />
                <span className="sr-only">Search jobs</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search jobs"
                />
              </label>
            </div>

            {!loading && visibleJobs.length > 0 && (
              <div className="jobs-list-heading" aria-hidden="true">
                <span />
                <span>Opportunity</span>
                <span>Added · status</span>
              </div>
            )}

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
                    {search.trim()
                      ? "No jobs match your search"
                      : jobs.length === 0
                        ? "Your next opportunity starts here"
                        : filter === "saved"
                          ? "No saved jobs yet"
                          : filter === "applied"
                            ? "No applications yet"
                            : "No jobs match this view"}
                  </h3>
                  <p>
                    {search.trim()
                      ? "Try a different search term or switch to another status filter."
                      : jobs.length === 0
                        ? "Add a listing you found and keep its details and application status together."
                        : filter === "saved"
                          ? "Save a role from Home and it will be waiting here when you want to revisit it."
                          : filter === "applied"
                            ? "Mark a role as Applied from its status menu to track it here."
                            : "Try another status filter or search term."}
                  </p>
                  {jobs.length === 0 && !search.trim() && (
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
                          <span className="match-score">{job.match_score.toFixed(1)}/5 AI match</span>
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
                          {job.source === "remoteok" ? "Remote OK" : humanize(job.source)}
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
                    <JobFollowUp
                      key={job.updated_at}
                      job={job}
                      saving={savingFollowUpId === job.id}
                      onSave={(jobId, appliedDate, notes, followUpDate) =>
                        void updateFollowUp(jobId, appliedDate, notes, followUpDate)
                      }
                    />
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
