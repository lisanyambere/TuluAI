"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { RequestStatus, TuluRequest } from "@tulu/shared";
import type { FacilityProfile } from "@/lib/mock-data";

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

  const setRequestStatus = useCallback((id: string, status: RequestStatus, action: string) => {
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
  }, []);

  const confirmRequest = useCallback((id: string) => {
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
  }, []);

  const rejectRequest = useCallback((id: string) => {
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
  }, []);

  const assignRequest = useCallback((id: string, assignee: string | undefined) => {
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
    setFacility((current) => ({
      ...current,
      ...updates,
      dataSource: "local_modified",
      lastReviewedAt: eventTime(),
    }));
  }, []);

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
