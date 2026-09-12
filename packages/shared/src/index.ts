export * from "./clinic-tools.js";
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
  };
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

export type FacilityProfile = {
  id: string;
  name: string;
  location: string;
  openingHours: string;
  services: string;
  verificationOwner: string;
  lastReviewedAt: string;
};

export type DashboardState = {
  facility: FacilityProfile;
  requests: TuluRequest[];
};

export type DashboardCommand =
  | { type: "update_facility"; updates: Partial<FacilityProfile> }
  | { type: "set_status"; id: string; status: RequestStatus; action: string }
  | { type: "confirm_request"; id: string }
  | { type: "reject_request"; id: string }
  | { type: "assign_request"; id: string; assignee?: string }
  | { type: "add_note"; id: string; body: string };
