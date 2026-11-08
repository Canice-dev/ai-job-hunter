"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type ProfileFacts = {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string[];
  experience: string[];
  education: string[];
};

type Onboarding = {
  cv: { id: string; original_filename: string; file_format: "pdf" | "docx"; file_size: number; created_at: string } | null;
  draft: ProfileFacts | null;
  profile: ProfileFacts | null;
  confirmed_at: string | null;
  is_confirmed: boolean;
};

type Props = {
  onClose?: () => void;
  onConfirmed: () => void;
  onDeleted: () => void;
};

const emptyFacts: ProfileFacts = {
  full_name: "",
  email: "",
  phone: "",
  location: "",
  summary: "",
  skills: [],
  experience: [],
  education: [],
};

async function readError(response: Response) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Fall back to a concise message for a non-JSON response.
  }
  return `The request failed (${response.status}). Please try again.`;
}

function lineValue(values: string[]) {
  return values.join("\n");
}

function listValue(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export default function ProfileOnboarding({ onClose, onConfirmed, onDeleted }: Props) {
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [facts, setFacts] = useState<ProfileFacts>(emptyFacts);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadOnboarding() {
      try {
        const response = await fetch("/api/backend/profile/onboarding", { cache: "no-store" });
        if (!response.ok) throw new Error(await readError(response));
        const result = (await response.json()) as Onboarding;
        if (!cancelled) {
          setOnboarding(result);
          setFacts(result.profile || result.draft || emptyFacts);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load your profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOnboarding();
    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadCV(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setNotice("");
    const payload = new FormData();
    payload.set("file", file);

    try {
      const response = await fetch("/api/backend/profile/cv", { method: "POST", body: payload });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as Onboarding;
      setOnboarding(result);
      setFacts(result.draft || emptyFacts);
      setNotice("CV uploaded. Review the extracted details before confirming them.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload your CV.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function confirmProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onboarding?.cv) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/backend/profile/confirm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_document_id: onboarding.cv.id, facts }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as Onboarding;
      setOnboarding(result);
      setFacts(result.profile || facts);
      if (onClose) setNotice("Profile changes saved.");
      else onConfirmed();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCV() {
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/backend/profile/cv", { method: "DELETE" });
      if (!response.ok) throw new Error(await readError(response));
      setOnboarding({ cv: null, draft: null, profile: null, confirmed_at: null, is_confirmed: false });
      setFacts(emptyFacts);
      setNotice("CV and confirmed profile deleted.");
      onDeleted();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete your CV.");
    } finally {
      setDeleting(false);
    }
  }

  function updateList(field: "skills" | "experience" | "education", value: string) {
    setFacts((current) => ({ ...current, [field]: listValue(value) }));
  }

  return (
    <main className="profile-shell">
      <section className="profile-onboarding-card" aria-labelledby="profile-title">
        <div className="profile-onboarding-top">
          <a className="auth-brand" href="#profile-title" aria-label="Job Hunter profile">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span>job<span className="brand-light">hunter</span></span>
          </a>
          {onClose && <button className="icon-button" onClick={onClose} aria-label="Close profile editor">×</button>}
        </div>

        <div className="profile-onboarding-heading">
          <p className="eyebrow">CV AND PROFILE</p>
          <h1 id="profile-title">{onboarding?.is_confirmed ? "Your profile" : "Start with your CV"}</h1>
          <p>We extract a draft for you to review. Only the details you confirm will be used for job matching.</p>
        </div>

        {error && <div className="profile-feedback profile-error" role="alert">{error}</div>}
        {notice && <div className="profile-feedback profile-success" role="status">{notice}</div>}

        {loading ? (
          <div className="auth-loading" role="status"><span className="loading-ring" />Loading your profile…</div>
        ) : !onboarding?.cv ? (
          <div className="cv-upload-area">
            <div className="cv-upload-mark" aria-hidden="true">↑</div>
            <h2>Upload your original CV</h2>
            <p>PDF or DOCX, up to 10 MB. Your file stays private and is never changed.</p>
            <label className="primary-button cv-upload-button">
              {uploading ? <><span className="button-spinner" />Reading CV…</> : "Choose a CV"}
              <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadCV} disabled={uploading} />
            </label>
          </div>
        ) : (
          <>
            <div className="cv-file-row">
              <span className="cv-file-icon" aria-hidden="true">{onboarding.cv.file_format.toUpperCase()}</span>
              <span className="cv-file-copy"><strong>{onboarding.cv.original_filename}</strong><small>{(onboarding.cv.file_size / (1024 * 1024)).toFixed(2)} MB · private original</small></span>
              <label className="secondary-button replace-cv-button">Replace<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadCV} disabled={uploading} /></label>
            </div>

            <form className="profile-facts-form" onSubmit={confirmProfile}>
              <div className="profile-review-note">Review each field. Correct anything that was extracted incorrectly; leave unsupported details blank.</div>
              <label>Full name<input value={facts.full_name} maxLength={200} onChange={(event) => setFacts({ ...facts, full_name: event.target.value })} /></label>
              <div className="profile-fields-two">
                <label>Email<input type="email" value={facts.email} maxLength={320} onChange={(event) => setFacts({ ...facts, email: event.target.value })} /></label>
                <label>Phone<input value={facts.phone} maxLength={80} onChange={(event) => setFacts({ ...facts, phone: event.target.value })} /></label>
                <label>Location<input value={facts.location} maxLength={200} placeholder="Add your preferred work location" onChange={(event) => setFacts({ ...facts, location: event.target.value })} /></label>
              </div>
              <label>Professional summary<textarea value={facts.summary} maxLength={5000} rows={4} onChange={(event) => setFacts({ ...facts, summary: event.target.value })} /></label>
              <label>Skills <span className="field-hint">One per line</span><textarea value={lineValue(facts.skills)} rows={4} onChange={(event) => updateList("skills", event.target.value)} /></label>
              <label>Experience <span className="field-hint">One role or detail per line</span><textarea value={lineValue(facts.experience)} rows={5} onChange={(event) => updateList("experience", event.target.value)} /></label>
              <label>Education <span className="field-hint">One qualification per line</span><textarea value={lineValue(facts.education)} rows={3} onChange={(event) => updateList("education", event.target.value)} /></label>
              <div className="profile-form-footer">
                <button type="button" className="danger-button" onClick={() => void deleteCV()} disabled={deleting}>{deleting ? "Deleting…" : "Delete CV and profile"}</button>
                <button type="submit" className="primary-button" disabled={saving || uploading}>{saving ? <><span className="button-spinner" />Saving…</> : onboarding.is_confirmed ? "Save profile" : "Confirm profile"}</button>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
