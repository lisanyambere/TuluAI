"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  DashboardCommand,
  DashboardState,
  FacilityProfile,
  RequestStatus,
  TuluRequest,
} from "@tulu/shared";

type DashboardDataContextValue = {
  requests: TuluRequest[];
  facility: FacilityProfile;
  setRequestStatus: (id: string, status: RequestStatus, action: string) => void;
  confirmRequest: (id: string) => void;
  rejectRequest: (id: string) => void;
  assignRequest: (id: string, assignee: string | undefined) => void;
  addNote: (id: string, body: string) => void;
  updateFacility: (updates: Partial<FacilityProfile>) => void;
};

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

const DEMO_ACTOR = "Grace N. (demo)";

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

  const applyState = useCallback((state: DashboardState) => {
    setRequests(state.requests);
    setFacility(state.facility);
  }, []);

  const sendCommand = useCallback(async (command: DashboardCommand) => {
    const response = await fetch("/agent-api/api/dashboard/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    if (response.ok) applyState((await response.json()) as DashboardState);
  }, [applyState]);

  useEffect(() => {
    const refresh = async () => {
      const response = await fetch("/agent-api/api/dashboard/state", {
        cache: "no-store",
      });
      if (response.ok) applyState((await response.json()) as DashboardState);
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(interval);
  }, [applyState]);

  const setRequestStatus = useCallback((id: string, status: RequestStatus, action: string) => {
    void sendCommand({ type: "set_status", id, status, action });
    setRequests((current) =>
      current.map((request) =>
        request.id !== id
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
  }, [sendCommand]);

  const confirmRequest = useCallback((id: string) => {
    void sendCommand({ type: "confirm_request", id });
    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              status: "confirmed",
              verification: {
                state: "verified",
                lastVerifiedAt: eventTime(),
                verifiedBy: DEMO_ACTOR,
              },
              auditEvents: [
                ...request.auditEvents,
                { id: `${id}-${Date.now()}`, actor: DEMO_ACTOR, action: "Information confirmed", createdAt: eventTime() },
              ],
            },
      ),
    );
  }, [sendCommand]);

  const rejectRequest = useCallback((id: string) => {
    void sendCommand({ type: "reject_request", id });
    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              status: "rejected",
              verification: {
                state: "verified",
                lastVerifiedAt: eventTime(),
                verifiedBy: DEMO_ACTOR,
              },
              auditEvents: [
                ...request.auditEvents,
                { id: `${id}-${Date.now()}`, actor: DEMO_ACTOR, action: "Availability marked unavailable", createdAt: eventTime() },
              ],
            },
      ),
    );
  }, [sendCommand]);

  const assignRequest = useCallback((id: string, assignee: string | undefined) => {
    void sendCommand({
      type: "assign_request",
      id,
      ...(assignee ? { assignee } : {}),
    });
    setRequests((current) =>
      current.map((request) =>
        request.id !== id
          ? request
          : {
              ...request,
              assignedTo: assignee,
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
  }, [sendCommand]);

  const addNote = useCallback((id: string, body: string) => {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    void sendCommand({ type: "add_note", id, body: trimmedBody });

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
  }, [sendCommand]);

  const updateFacility = useCallback((updates: Partial<FacilityProfile>) => {
    void sendCommand({ type: "update_facility", updates });
    setFacility((current) => ({ ...current, ...updates, lastReviewedAt: eventTime() }));
  }, [sendCommand]);

  const value = useMemo(
    () => ({ requests, facility, setRequestStatus, confirmRequest, rejectRequest, assignRequest, addNote, updateFacility }),
    [requests, facility, setRequestStatus, confirmRequest, rejectRequest, assignRequest, addNote, updateFacility],
  );

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext);
  if (!context) throw new Error("useDashboardData must be used inside DashboardDataProvider");
  return context;
}
