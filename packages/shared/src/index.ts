export * from "./live-session.js";

export const REQUEST_STATUSES = [
  "new",
  "in_review",
  "needs_verification",
  "awaiting_clarification",
  "confirmed",
  "rejected",
  "escalated",
  "resolved",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type RequestPriority = "normal" | "urgent";

export type RequestLanguage = "en" | "sw";

export type VerificationState =
  | "unverified"
  | "partially_verified"
  | "verified"
  | "stale";

export type CallerCommunicationState =
  | "not_ready"
  | "ready_to_communicate"
  | "follow_up_due"
  | "communicated";

export type CallerCommunicationMethod = "voice_follow_up" | "callback";

export type RequestNextAction = {
  summary: string;
  owner?: string;
  dueAt?: string;
};

export type JourneyContext = {
  travelPlan?: string;
  accessConstraint?: string;
};

export type RequestNote = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  createdAt: string;
};

export type TuluRequest = {
  id: string;
  receivedAt: string;
  status: RequestStatus;
  priority: RequestPriority;
  language: RequestLanguage;
  summary: string;
  requestedService: string;
  callerReference: string;
  facilityId: string;
  facilityName: string;
  assignedTo?: string;
  verification: {
    state: VerificationState;
    lastVerifiedAt?: string;
    verifiedBy?: string;
    source?: string;
    expiresAt?: string;
  };
  callerCommunication: {
    state: CallerCommunicationState;
    recordedAt?: string;
    recordedBy?: string;
    method?: CallerCommunicationMethod;
  };
  nextAction: RequestNextAction;
  journeyContext?: JourneyContext;
  notes: RequestNote[];
  auditEvents: AuditEvent[];
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: "New",
  in_review: "In review",
  needs_verification: "Needs verification",
  awaiting_clarification: "Awaiting clarification",
  confirmed: "Confirmed",
  escalated: "Escalated",
  resolved: "Resolved",
  rejected: "Unavailable / rejected",
};
