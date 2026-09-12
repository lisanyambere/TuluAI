"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useDashboardData } from "@/components/dashboard-data-provider";

export function FacilityEditor() {
  const { facility, updateFacility } = useDashboardData();
  const [form, setForm] = useState(facility);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setForm(facility);
  }, [facility]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateFacility({
      location: form.location,
      openingHours: form.openingHours,
      services: form.services,
    });
    setNotice("Facility information updated. This demo change is local to the browser.");
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Facility information</p>
          <h1>{facility.name}</h1>
          <p className="page-subtitle">Keep the facts callers rely on current and easy to verify.</p>
        </div>
        <span className="status-badge status-badge--verified">Demo editing enabled</span>
      </div>

      {notice && <div className="callout callout--success" role="status">{notice}</div>}

      <form className="content-card facility-card" onSubmit={handleSubmit}>
        <div className="section-heading">
          <div>
            <p className="card-kicker">Operational profile</p>
            <h2>What callers may need to know</h2>
          </div>
          <span className="freshness-note">Last reviewed {facility.lastReviewedAt}</span>
        </div>
        <div className="facility-form-grid">
          <label className="form-field">
            <span className="field-label">Facility name</span>
            <input value={form.name} disabled />
          </label>
          <label className="form-field">
            <span className="field-label">Verification owner</span>
            <input value={form.verificationOwner} disabled />
          </label>
          <label className="form-field">
            <span className="field-label">Location</span>
            <input id="location" value={form.location} onChange={(event) => updateField("location", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Opening hours</span>
            <input id="opening-hours" value={form.openingHours} onChange={(event) => updateField("openingHours", event.target.value)} />
          </label>
          <label className="form-field form-field--wide">
            <span className="field-label">Services listed</span>
            <textarea id="services" rows={3} value={form.services} onChange={(event) => updateField("services", event.target.value)} />
          </label>
        </div>
        <div className="facility-actions">
          <p className="demo-label">These edits do not update a real facility system yet.</p>
          <button className="button button--primary" type="submit">Save facility information</button>
        </div>
      </form>

      <section className="content-card facility-card" aria-labelledby="freshness-title">
        <div className="section-heading">
          <div>
            <p className="card-kicker">Verification policy</p>
            <h2 id="freshness-title">Keep operational facts trustworthy</h2>
          </div>
        </div>
        <div className="policy-grid">
          <div><strong>Show freshness</strong><span>Every caller-facing fact should carry its last reviewed time.</span></div>
          <div><strong>Separate confidence</strong><span>AI suggestions remain distinct from staff-confirmed information.</span></div>
          <div><strong>Escalate uncertainty</strong><span>Stale, ambiguous, or sensitive information should move to human follow-up.</span></div>
        </div>
      </section>
    </div>
  );
}
