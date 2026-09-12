"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { StatusBadge, VerificationBadge } from "@/components/status-badge";
import { useDashboardData } from "@/components/dashboard-data-provider";

export function RequestDetail({ requestId }: { requestId: string }) {
  const { requests, setRequestStatus, confirmRequest, rejectRequest, assignRequest, addNote } = useDashboardData();
  const request = requests.find((item) => item.id === requestId);
  const [notice, setNotice] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  if (!request) {
    return (
      <div className="error-state">
        <p className="eyebrow">Request not found</p>
        <h1>We could not find that request.</h1>
        <p>It may have been removed from this demo workspace.</p>
        <Link className="button button--primary" href="/dashboard">Back to requests</Link>
      </div>
    );
  }

  const showResolutionAction = request.status === "confirmed" || request.status === "rejected";
  const actionHeading = request.status === "resolved" ? "Outcome recorded" : request.status === "escalated" ? "Human follow-up needed" : "What needs to happen next?";

  const notify = (message: string) => {
    setNotice(`${message} This demo change is local to the browser.`);
  };

  const handleNoteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!noteDraft.trim()) return;
    addNote(request.id, noteDraft);
    setNoteDraft("");
    notify("Internal note added.");
  };

  return (
    <div className="page-stack">
      <Link className="back-link" href="/dashboard">
        <span aria-hidden="true">←</span> Back to request queue
      </Link>

      <div className="detail-heading">
        <div>
          <div className="request-row__meta">
            <span className="request-id">{request.id}</span>
            <span>{request.language === "sw" ? "Kiswahili" : "English"}</span>
            <span>{request.facilityName}</span>
          </div>
          <h1>{request.summary}</h1>
          <p className="page-subtitle">{request.requestedService} · {request.callerReference}</p>
        </div>
        <div className="detail-heading__status">
          <StatusBadge status={request.status} />
          <VerificationBadge state={request.verification.state} />
        </div>
      </div>

      {notice && <div className="callout callout--success" role="status">{notice}</div>}

      <div className="detail-grid">
        <div className="detail-main">
          <section className="content-card" aria-labelledby="need-title">
            <div className="section-heading">
              <div>
                <p className="card-kicker">Caller need</p>
                <h2 id="need-title">What the caller is asking for</h2>
              </div>
              <span className="priority-pill">{request.priority === "urgent" ? "Urgent request" : "Standard request"}</span>
            </div>
            <p className="detail-summary">The caller wants to know whether the relevant service is available before traveling to the facility. The voice agent has captured the request, but the operational answer still needs a staff check.</p>
            <div className="detail-facts">
              <div><span className="field-label">Received</span><strong>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(request.receivedAt))}</strong></div>
              <div><span className="field-label">Language</span><strong>{request.language === "sw" ? "Kiswahili" : "English"}</strong></div>
              <div><span className="field-label">Assigned to</span><strong>{request.assignedTo || "Unassigned"}</strong></div>
              <div><span className="field-label">Caller reference</span><strong>{request.callerReference}</strong></div>
            </div>
          </section>

          <section className="content-card" aria-labelledby="verification-title">
            <div className="section-heading">
              <div>
                <p className="card-kicker">Evidence and freshness</p>
                <h2 id="verification-title">What is safe to tell the caller?</h2>
              </div>
              <VerificationBadge state={request.verification.state} />
            </div>
            <div className="verification-panel">
              <div className="verification-panel__icon" aria-hidden="true">✓</div>
              <div>
                <strong>{request.verification.state === "verified" ? "Staff-confirmed information" : "Staff confirmation is still needed"}</strong>
                <p>{request.verification.lastVerifiedAt ? `Last checked by ${request.verification.verifiedBy} on ${request.verification.lastVerifiedAt}.` : "No staff verification has been recorded for this request yet."}</p>
              </div>
            </div>
            <div className="callout callout--warning">
              Do not promise availability, an appointment, or emergency support until an authorized staff member confirms the relevant fact.
            </div>
          </section>

          <section className="content-card" aria-labelledby="timeline-title">
            <div className="section-heading">
              <div>
                <p className="card-kicker">Audit trail</p>
                <h2 id="timeline-title">What has happened so far</h2>
              </div>
            </div>
            <div className="timeline">
              {request.auditEvents.map((event) => (
                <div className="timeline__item" key={event.id}>
                  <span className="timeline__dot" aria-hidden="true" />
                  <div><strong>{event.action}</strong><span>{event.actor} · {event.createdAt}</span></div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="detail-side">
          <section className="content-card action-card" aria-labelledby="action-title">
            <p className="card-kicker">Request action</p>
            <h2 id="action-title">{actionHeading}</h2>
            <p>Keep the next step explicit. Demo actions update the local queue and append an audit event.</p>

            {request.status === "new" && (
              <button className="button button--secondary button--full" type="button" onClick={() => { setRequestStatus(request.id, "in_review", "Review started"); notify("Request moved into review."); }}>Start review</button>
            )}
            {request.status !== "resolved" && request.status !== "confirmed" && request.status !== "rejected" && (
              <>
                <button className="button button--primary button--full" type="button" onClick={() => { confirmRequest(request.id); notify("Information confirmed."); }}>Confirm information</button>
                <button className="button button--secondary button--full" type="button" onClick={() => { rejectRequest(request.id); notify("Availability marked unavailable."); }}>Mark unavailable</button>
                <button className="button button--secondary button--full" type="button" onClick={() => { setRequestStatus(request.id, "awaiting_clarification", "Clarification requested"); notify("Clarification requested."); }}>Request clarification</button>
                <button className="button button--quiet button--full" type="button" onClick={() => { setRequestStatus(request.id, "escalated", "Escalated to supervisor"); notify("Request escalated to a supervisor."); }}>Escalate to supervisor</button>
              </>
            )}
            {showResolutionAction && (
              <button className="button button--primary button--full" type="button" onClick={() => { setRequestStatus(request.id, "resolved", "Request resolved"); notify("Request marked resolved."); }}>Mark request resolved</button>
            )}
            {request.status === "resolved" && <div className="callout callout--success">This request has a recorded outcome and is closed in the demo queue.</div>}
            <Link className="text-button text-button--link" href="/dashboard/facility">Correct facility information →</Link>
          </section>

          <section className="content-card assignment-card" aria-labelledby="assignment-title">
            <div className="section-heading">
              <div><p className="card-kicker">Ownership</p><h2 id="assignment-title">Who is responsible?</h2></div>
            </div>
            <label className="field-label" htmlFor="assignee">Assigned staff member</label>
            <select className="select-field" id="assignee" value={request.assignedTo || ""} onChange={(event) => { assignRequest(request.id, event.target.value || undefined); notify(event.target.value ? `Assigned to ${event.target.value}.` : "Assignment removed."); }}>
              <option value="">Unassigned</option>
              <option value="You">You</option>
              <option value="Grace N.">Grace N.</option>
              <option value="Peter L.">Peter L.</option>
            </select>
            <p className="demo-label">Assignment changes are local until the agent API is connected.</p>
          </section>

          <section className="content-card note-card" aria-labelledby="notes-title">
            <div className="section-heading">
              <div><p className="card-kicker">Internal notes</p><h2 id="notes-title">Keep the handoff clear</h2></div>
            </div>
            {request.notes.map((note) => <div className="note-entry" key={note.id}><strong>{note.author}</strong><span>{note.createdAt}</span><p>{note.body}</p></div>)}
            <form className="note-form" onSubmit={handleNoteSubmit}>
              <label className="field-label" htmlFor="note">Add internal note</label>
              <textarea id="note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="What should the next staff member know?" rows={3} />
              <button className="button button--secondary button--full" type="submit" disabled={!noteDraft.trim()}>Save note</button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
