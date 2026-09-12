"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { CallerCommunicationMethod, RequestStatus, TuluRequest } from "@tulu/shared";
import type { FacilityProfile } from "@/lib/mock-data";

type DashboardDataContextValue = {
  requests: TuluRequest[];
  facility: FacilityProfile;
  setRequestStatus: (id: string, status: RequestStatus, action: string) => void;
  confirmRequest: (id: string) => void;
  rejectRequest: (id: string, reason: string) => void;
  escalateRequest: (id: string, reason: string) => void;
  flagClarification: (id: string) => void;
  recordCallerFollowUp: (id: string, method: CallerCommunicationMethod) => void;
  assignRequest: (id: string, assignee: string | undefined) => void;
  addNote: (id: string, body: string) => void;
  updateFacility: (updates: Partial<FacilityProfile>) => void;
};

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

const DEMO_ACTOR = "Grace N. (demo)";
const DEMO_SUPERVISOR = "Grace N.";

function eventTime() {
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export function DashboardDataProvider({
  initialRequests,
  initialFacility,
  children,
}: {
  initialRequests: TuluRequest[];
  initialFacility: FacilityProfile;
  children: React.ReactNode;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [facility, setFacility] = useState(initialFacility);

  const setRequestStatus = useCallback((id: string, status: RequestStatus, action: string) => {
    setRequests((current) =>
      current.map((request) =>
        request.id !== id || (status === "resolved" && request.callerCommunication.state !== "communicated")
          ? request
          : {
              ...request,
              status,
              auditEvents: [
                ...request.auditEvents,
                { id: `${id}-${Date.now()}`, actor: DEMO_ACTOR, action, createdAt: eventTime() },
              ],
            },
      ),
    );
  }, []);

  const confirmRequest = useCallback((id: string) => {
    const createdAt = eventTime();

    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              status: "confirmed",
              verification: {
                state: "verified",
                lastVerifiedAt: createdAt,
                verifiedBy: DEMO_ACTOR,
                source: "Facility staff confirmation (demo)",
                expiresAt: "End of current shift",
              },
              callerCommunication: { state: "ready_to_communicate" },
              nextAction: {
                summary: "Record a staff-confirmed caller follow-up",
                owner: request.assignedTo || request.nextAction.owner,
                dueAt: request.nextAction.dueAt,
              },
              auditEvents: [
                ...request.auditEvents,
                {
                  id: `${id}-${Date.now()}`,
                  actor: DEMO_ACTOR,
                  action: "Information confirmed; caller follow-up is ready",
                  createdAt,
                },
              ],
            },
      ),
    );
  }, []);

  const rejectRequest = useCallback((id: string, reason: string) => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;

    const createdAt = eventTime();

    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              status: "rejected",
              verification: {
                state: "verified",
                lastVerifiedAt: createdAt,
                verifiedBy: DEMO_ACTOR,
                source: "Facility staff confirmation (demo)",
                expiresAt: "End of current shift",
              },
              callerCommunication: { state: "ready_to_communicate" },
              nextAction: {
                summary: "Record a caller follow-up about the unavailable service",
                owner: request.assignedTo || request.nextAction.owner,
                dueAt: request.nextAction.dueAt,
              },
              auditEvents: [
                ...request.auditEvents,
                {
                  id: `${id}-${Date.now()}`,
                  actor: DEMO_ACTOR,
                  action: `Availability marked unavailable — ${trimmedReason}`,
                  createdAt,
                },
              ],
            },
      ),
    );
  }, []);

  const escalateRequest = useCallback((id: string, reason: string) => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;

    const createdAt = eventTime();

    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              status: "escalated",
              assignedTo: DEMO_SUPERVISOR,
              callerCommunication: { state: "follow_up_due" },
              nextAction: {
                summary: "Supervisor review and a safe caller update",
                owner: DEMO_SUPERVISOR,
                dueAt: request.nextAction.dueAt || "Before the end of the current shift",
              },
              auditEvents: [
                ...request.auditEvents,
                {
                  id: `${id}-${Date.now()}`,
                  actor: DEMO_ACTOR,
                  action: `Escalated to supervisor — ${trimmedReason}`,
                  createdAt,
                },
              ],
            },
      ),
    );
  }, []);

  const flagClarification = useCallback((id: string) => {
    const createdAt = eventTime();

    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              status: "awaiting_clarification",
              callerCommunication: { state: "follow_up_due" },
              nextAction: {
                summary: "Clarify the request during a staff follow-up",
                owner: request.assignedTo || request.nextAction.owner,
                dueAt: request.nextAction.dueAt,
              },
              auditEvents: [
                ...request.auditEvents,
                {
                  id: `${id}-${Date.now()}`,
                  actor: DEMO_ACTOR,
                  action: "Clarification flagged for caller follow-up",
                  createdAt,
                },
              ],
            },
      ),
    );
  }, []);

  const recordCallerFollowUp = useCallback((id: string, method: CallerCommunicationMethod) => {
    const createdAt = eventTime();
    const methodLabel = method === "voice_follow_up" ? "voice follow-up" : "callback";

    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              callerCommunication: {
                state: "communicated",
                method,
                recordedAt: createdAt,
                recordedBy: DEMO_ACTOR,
              },
              nextAction: {
                ...request.nextAction,
                summary: "Record the outcome",
                owner: request.assignedTo || request.nextAction.owner,
              },
              auditEvents: [
                ...request.auditEvents,
                {
                  id: `${id}-${Date.now()}`,
                  actor: DEMO_ACTOR,
                  action: `Caller ${methodLabel} recorded as complete`,
                  createdAt,
                },
              ],
            },
      ),
    );
  }, []);

  const assignRequest = useCallback((id: string, assignee: string | undefined) => {
    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              assignedTo: assignee,
              nextAction: { ...request.nextAction, owner: assignee },
              auditEvents: [
                ...request.auditEvents,
                {
                  id: `${id}-${Date.now()}`,
                  actor: DEMO_ACTOR,
                  action: assignee ? `Assigned to ${assignee}` : "Assignment removed",
                  createdAt: eventTime(),
                },
              ],
            },
      ),
    );
  }, []);

  const addNote = useCallback((id: string, body: string) => {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              notes: [
                ...request.notes,
                { id: `${id}-note-${Date.now()}`, author: DEMO_ACTOR, body: trimmedBody, createdAt: eventTime() },
              ],
              auditEvents: [
                ...request.auditEvents,
                { id: `${id}-${Date.now()}`, actor: DEMO_ACTOR, action: "Internal note added", createdAt: eventTime() },
              ],
            },
      ),
    );
  }, []);

  const updateFacility = useCallback((updates: Partial<FacilityProfile>) => {
    setFacility((current) => ({ ...current, ...updates, lastReviewedAt: eventTime() }));
  }, []);

  const value = useMemo(
    () => ({
      requests,
      facility,
      setRequestStatus,
      confirmRequest,
      rejectRequest,
      escalateRequest,
      flagClarification,
      recordCallerFollowUp,
      assignRequest,
      addNote,
      updateFacility,
    }),
    [
      requests,
      facility,
      setRequestStatus,
      confirmRequest,
      rejectRequest,
      escalateRequest,
      flagClarification,
      recordCallerFollowUp,
      assignRequest,
      addNote,
      updateFacility,
    ],
  );

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext);
  if (!context) throw new Error("useDashboardData must be used inside DashboardDataProvider");
  return context;
}
