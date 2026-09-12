import { REQUEST_STATUS_LABELS, type RequestStatus, type VerificationState } from "@tulu/shared";

const statusClass: Record<RequestStatus, string> = {
  new: "status-badge--new",
  in_review: "status-badge--review",
  needs_verification: "status-badge--warning",
  awaiting_clarification: "status-badge--warning",
  confirmed: "status-badge--verified",
  rejected: "status-badge--danger",
  escalated: "status-badge--danger",
  resolved: "status-badge--resolved",
};

const verificationLabels: Record<VerificationState, string> = {
  unverified: "Not verified",
  partially_verified: "Partially verified",
  verified: "Staff verified",
  stale: "Needs re-check",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`status-badge ${statusClass[status]}`}>{REQUEST_STATUS_LABELS[status]}</span>;
}

export function VerificationBadge({ state }: { state: VerificationState }) {
  return <span className={`verification-badge verification-badge--${state}`}>{verificationLabels[state]}</span>;
}
