"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CommunicationBadge, StatusBadge, VerificationBadge } from "@/components/status-badge";
import { useDashboardData } from "@/components/dashboard-data-provider";
import type { TuluRequest } from "@tulu/shared";

type Filter = "all" | "needs_verification" | "urgent" | "assigned";

function formatReceivedAt(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getNextAction(request: TuluRequest) {
  return request.nextAction.summary;
}

export function RequestQueue() {
  const { requests } = useDashboardData();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "needs_verification" && request.verification.state !== "verified") ||
        (filter === "urgent" && request.priority === "urgent") ||
        (filter === "assigned" && Boolean(request.assignedTo));
      const matchesQuery =
        !normalizedQuery ||
        [request.id, request.summary, request.requestedService, request.callerReference]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [filter, query, requests]);

  const awaitingVerification = requests.filter((request) => request.verification.state !== "verified").length;
  const urgentCount = requests.filter((request) => request.priority === "urgent").length;

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--queue">
        <div>
          <p className="eyebrow">Today · Saturday, 12 September</p>
          <h1>Good morning, let’s keep people moving.</h1>
          <p className="page-subtitle">Review what callers need before they make the journey to Maralal Community Health Centre.</p>
        </div>
        <div className="header-signal">
          <span className="pulse-dot" aria-hidden="true" />
          <span>Local demo workspace</span>
        </div>
      </div>

      <section className="metric-grid" aria-label="Request overview">
        <div className="metric-card metric-card--accent">
          <span className="metric-card__label">Open requests</span>
          <strong>{requests.filter((request) => request.status !== "resolved").length}</strong>
          <span className="metric-card__note">Across today’s queue</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Awaiting verification</span>
          <strong>{awaitingVerification}</strong>
          <span className="metric-card__note">Information needs a staff check</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Needs same-day response</span>
          <strong>{urgentCount}</strong>
          <span className="metric-card__note">Caller-reported time sensitivity</span>
        </div>
        <div className="metric-card metric-card--quiet">
          <span className="metric-card__label">Resolved today</span>
          <strong>{requests.filter((request) => request.status === "resolved").length}</strong>
          <span className="metric-card__note">A record of completed follow-up</span>
        </div>
      </section>

      <section className="content-card queue-card" aria-labelledby="queue-title">
        <div className="section-heading section-heading--queue">
          <div>
            <p className="card-kicker">Request queue</p>
            <h2 id="queue-title">What needs a human decision?</h2>
          </div>
          <span className="freshness-note">Synthetic demo data · updates are local</span>
        </div>

        <div className="queue-toolbar">
          <label className="search-field">
            <span className="sr-only">Search requests</span>
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search requests or services"
            />
          </label>
          <div className="filter-tabs" role="group" aria-label="Filter requests">
            <button className={filter === "all" ? "filter-tab filter-tab--active" : "filter-tab"} onClick={() => setFilter("all")} type="button">All</button>
            <button className={filter === "needs_verification" ? "filter-tab filter-tab--active" : "filter-tab"} onClick={() => setFilter("needs_verification")} type="button">Needs review</button>
            <button className={filter === "urgent" ? "filter-tab filter-tab--active" : "filter-tab"} onClick={() => setFilter("urgent")} type="button">Same-day</button>
            <button className={filter === "assigned" ? "filter-tab filter-tab--active" : "filter-tab"} onClick={() => setFilter("assigned")} type="button">Assigned</button>
          </div>
        </div>

        <div className="request-list" role="list">
          {filteredRequests.map((request) => (
            <Link className="request-row" href={`/dashboard/requests/${request.id}`} key={request.id} role="listitem">
              <div className="request-row__main">
                <div className="request-row__meta">
                  <span className="request-id">{request.id}</span>
                  <span className={request.priority === "urgent" ? "priority-label priority-label--urgent" : "priority-label"}>
                    {request.priority === "urgent" ? "Same-day" : "Standard"}
                  </span>
                  <span>{formatReceivedAt(request.receivedAt)}</span>
                </div>
                <h3>{request.summary}</h3>
                <p>{request.requestedService} · {request.callerReference}</p>
              </div>
              <div className="request-row__status">
                <StatusBadge status={request.status} />
                <VerificationBadge state={request.verification.state} />
                <CommunicationBadge state={request.callerCommunication.state} />
              </div>
              <div className="request-row__action">
                <div>
                  <strong>{getNextAction(request)}</strong>
                  <small>Next owner: {request.nextAction.owner || request.assignedTo || "Not assigned"}{request.nextAction.dueAt ? ` · Update by ${request.nextAction.dueAt}` : ""}</small>
                </div>
                <span aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
          {filteredRequests.length === 0 && (
            <div className="empty-state">
              <strong>No requests match this view.</strong>
              <span>Try another filter or search term.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
