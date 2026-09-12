"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CommunicationBadge, StatusBadge, VerificationBadge } from "@/components/status-badge";
import { useDashboardData } from "@/components/dashboard-data-provider";

type ReasonAction = "reject" | "escalate";

function followUpMethodLabel(method: "voice_follow_up" | "callback" | undefined) {
  if (method === "callback") return "callback";
  if (method === "voice_follow_up") return "voice follow-up";
  return "staff follow-up";
}

export function RequestDetail({ requestId }: { requestId: string }) {
  const {
    requests,
    setRequestStatus,
    confirmRequest,
    rejectRequest,
    escalateRequest,
    flagClarification,
    recordCallerFollowUp,
    assignRequest,
    addNote,
  } = useDashboardData();
  const request = requests.find((item) => item.id === requestId);
  const [notice, setNotice] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");

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
  const canChooseOutcome = !["resolved", "confirmed", "rejected"].includes(request.status);
  const callerFollowUpIsDue = ["ready_to_communicate", "follow_up_due"].includes(request.callerCommunication.state);
  const canRecordCallerFollowUp = callerFollowUpIsDue && ["confirmed", "rejected", "awaiting_clarification", "escalated"].includes(request.status);
  const actionHeading =
    request.status === "resolved"
      ? "Outcome recorded"
      : reasonAction
        ? "Reason required"
        : request.status === "escalated"
          ? "Supervisor follow-up needed"
          : "What needs to happen next?";

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

  const handleReasonSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = reasonDraft.trim();
    if (!reasonAction || !reason) return;

    if (reasonAction === "reject") {
      rejectRequest(request.id, reason);
      notify("Availability marked unavailable and queued for caller follow-up.");
    } else {
      escalateRequest(request.id, reason);
      notify("Request escalated with a recorded reason.");
    }

    setReasonAction(null);
    setReasonDraft("");
  };

  const startReasonAction = (action: ReasonAction) => {
    setReasonAction(action);
    setReasonDraft("");
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
          <CommunicationBadge state={request.callerCommunication.state} />
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
              <span className={request.priority === "urgent" ? "priority-pill priority-pill--same-day" : "priority-pill"}>{request.priority === "urgent" ? "Same-day response" : "Standard response"}</span>
            </div>
            <p className="detail-summary">The caller wants to know whether the relevant service is available before traveling to the facility. The voice agent has captured the request, but the operational answer still needs a staff check.</p>
            <div className="detail-facts">
              <div><span className="field-label">Received</span><strong>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(request.receivedAt))}</strong></div>
              <div><span className="field-label">Language</span><strong>{request.language === "sw" ? "Kiswahili" : "English"}</strong></div>
              <div><span className="field-label">Assigned to</span><strong>{request.assignedTo || "Unassigned"}</strong></div>
              <div><span className="field-label">Caller reference</span><strong>{request.callerReference}</strong></div>
            </div>
          </section>

          <section className="content-card workflow-card" aria-labelledby="handoff-title">
            <div className="section-heading">
              <div>
                <p className="card-kicker">Workflow handoff</p>
                <h2 id="handoff-title">Who owns the next update?</h2>
              </div>
              <CommunicationBadge state={request.callerCommunication.state} />
            </div>
            <p className="workflow-summary">{request.nextAction.summary}</p>
            <div className="workflow-facts">
              <div><span className="field-label">Next owner</span><strong>{request.nextAction.owner || request.assignedTo || "Not assigned"}</strong></div>
              <div><span className="field-label">Promised update</span><strong>{request.nextAction.dueAt || "Not set"}</strong></div>
            </div>

            {request.callerCommunication.state === "communicated" ? (
              <div className="callout callout--success workflow-callout">
                {request.callerCommunication.recordedBy || "Staff"} recorded a {followUpMethodLabel(request.callerCommunication.method)} as complete{request.callerCommunication.recordedAt ? ` on ${request.callerCommunication.recordedAt}` : ""}.
              </div>
            ) : canRecordCallerFollowUp ? (
              <div className="workflow-actions">
                <button className="button button--primary" type="button" onClick={() => { recordCallerFollowUp(request.id, "voice_follow_up"); notify("Voice follow-up recorded as complete."); }}>Record voice follow-up complete</button>
                <button className="button button--secondary" type="button" onClick={() => { recordCallerFollowUp(request.id, "callback"); notify("Callback recorded as complete."); }}>Record callback complete</button>
                <p className="demo-label">These buttons only record staff-reported follow-up; they do not call or message the caller.</p>
              </div>
            ) : (
              <div className="callout callout--neutral workflow-callout">
                A caller update is not ready to record yet. Verify the facility fact, or flag the need for clarification, before recording follow-up.
              </div>
            )}
          </section>

          <section className="content-card" aria-labelledby="verification-title">
            <div className="section-heading">
              <div>
                <p className="card-kicker">Evidence and freshness</p>
                <h2 id="verification-title">What is safe to tell the caller?</h2>
              </div>
              <VerificationBadge state={request.verification.state} />
            </div>
            <div className={`verification-panel${request.verification.state === "verified" ? "" : " verification-panel--warning"}`}>
              <div className="verification-panel__icon" aria-hidden="true">{request.verification.state === "verified" ? "✓" : "!"}</div>
              <div>
                <strong>{request.verification.state === "verified" ? "Staff-confirmed information" : "Staff confirmation is still needed"}</strong>
                <p>{request.verification.lastVerifiedAt ? `Last checked by ${request.verification.verifiedBy} on ${request.verification.lastVerifiedAt}.` : "No staff verification has been recorded for this request yet."}</p>
              </div>
            </div>
            <div className="evidence-facts">
              <div><span className="field-label">Evidence source</span><strong>{request.verification.source || "No source recorded"}</strong></div>
              <div><span className="field-label">Checked at</span><strong>{request.verification.lastVerifiedAt || "Not checked"}</strong></div>
              <div><span className="field-label">Fresh until</span><strong>{request.verification.expiresAt || "No expiry recorded"}</strong></div>
            </div>
            <div className="callout callout--warning">
              Do not promise availability, an appointment, or emergency support until an authorized staff member confirms the relevant fact.
            </div>
          </section>

          <section className="content-card journey-card" aria-labelledby="journey-title">
            <div className="section-heading">
              <div>
                <p className="card-kicker">Caller-provided journey context</p>
                <h2 id="journey-title">What would make the journey worthwhile?</h2>
              </div>
            </div>
            <div className="journey-grid">
              <div><span className="field-label">Travel context</span><strong>{request.journeyContext?.travelPlan || "No travel context recorded"}</strong></div>
              <div><span className="field-label">Access constraint</span><strong>{request.journeyContext?.accessConstraint || "No access constraint recorded"}</strong></div>
            </div>
            <div className="callout callout--neutral">This is caller-reported access context, not a clinical-triage signal.</div>
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

            {reasonAction ? (
              <form className="reason-form" onSubmit={handleReasonSubmit}>
                <label className="field-label" htmlFor={`reason-${request.id}`}>
                  {reasonAction === "reject" ? "Why is this unavailable?" : "Why does this need escalation?"}
                </label>
                <textarea
                  id={`reason-${request.id}`}
                  value={reasonDraft}
                  onChange={(event) => setReasonDraft(event.target.value)}
                  placeholder={reasonAction === "reject" ? "Record the verified availability constraint." : "Record what requires supervisor review."}
                  rows={4}
                  autoFocus
                />
                <div className="reason-form__actions">
                  <button className="button button--secondary" type="button" onClick={() => { setReasonAction(null); setReasonDraft(""); }}>Cancel</button>
                  <button className="button button--primary" type="submit" disabled={!reasonDraft.trim()}>{reasonAction === "reject" ? "Confirm unavailable" : "Confirm escalation"}</button>
                </div>
              </form>
            ) : (
              <>
                {request.status === "new" && (
                  <button className="button button--secondary button--full" type="button" onClick={() => { setRequestStatus(request.id, "in_review", "Review started"); notify("Request moved into review."); }}>Start review</button>
                )}
                {canChooseOutcome && (
                  <>
                    <button className="button button--primary button--full" type="button" onClick={() => { confirmRequest(request.id); notify("Information confirmed and ready for caller follow-up."); }}>Confirm information</button>
                    <button className="button button--secondary button--full" type="button" onClick={() => startReasonAction("reject")}>Mark unavailable</button>
                    {request.status !== "awaiting_clarification" && <button className="button button--secondary button--full" type="button" onClick={() => { flagClarification(request.id); notify("Clarification flagged for a staff caller follow-up."); }}>Flag clarification for follow-up</button>}
                    {request.status !== "escalated" && <button className="button button--quiet button--full" type="button" onClick={() => startReasonAction("escalate")}>Escalate to supervisor</button>}
                  </>
                )}
                {showResolutionAction && (
                  request.callerCommunication.state === "communicated" ? (
                    <button className="button button--primary button--full" type="button" onClick={() => { setRequestStatus(request.id, "resolved", "Request resolved after caller follow-up"); notify("Request marked resolved."); }}>Mark request resolved</button>
                  ) : (
                    <div className="callout callout--warning">Record the caller follow-up before closing this request. Recording it here does not send a message.</div>
                  )
                )}
                {request.status === "resolved" && <div className="callout callout--success">This request has a recorded outcome and is closed in the demo queue.</div>}
              </>
            )}
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
            <p className="demo-label">The selected staff member becomes the next owner in this local demo.</p>
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
