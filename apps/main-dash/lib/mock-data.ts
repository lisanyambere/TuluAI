import type { TuluRequest } from "@tulu/shared";

export type FacilityProfile = {
  id: string;
  name: string;
  location: string;
  openingHours: string;
  services: string;
  verificationOwner: string;
  lastReviewedAt: string;
  dataSource: "agent_api" | "local_fallback" | "local_modified";
  synthetic: true;
};

export const MOCK_FACILITY: FacilityProfile = {
  id: "facility-north-ridge-demo",
  name: "Tulu North Ridge Demo Health Centre",
  location: "North Ridge Demo Settlement, Samburu-inspired Demo Region",
  openingHours: "Not included in the synthetic operations dataset",
  services:
    "Child health services · limited; General consultation · available; Maternal health support · available",
  verificationOwner: "Synthetic demo seed",
  lastReviewedAt: "10 Sep 2026 · 11:30",
  dataSource: "local_fallback",
  synthetic: true,
};

export const MOCK_REQUESTS: TuluRequest[] = [
  {
    id: "TUL-1042",
    receivedAt: "2026-09-12T05:36:00.000Z",
    status: "needs_verification",
    priority: "urgent",
    language: "sw",
    summary: "Is maternity care available today?",
    requestedService: "Maternal health support",
    callerReference: "Caller · Kiswahili",
    facilityId: "facility-north-ridge-demo",
    facilityName: "Tulu North Ridge Demo Health Centre",
    assignedTo: "Grace N.",
    verification: { state: "stale", lastVerifiedAt: "11 Sep 2026 · 16:10", verifiedBy: "Joseph K." },
    notes: [{ id: "n-1042-1", author: "Grace N.", body: "Waiting for the maternity desk to confirm today's coverage.", createdAt: "12 Sep · 08:48" }],
    auditEvents: [
      { id: "a-1042-1", actor: "Tulu voice agent", action: "Request received", createdAt: "12 Sep · 08:36" },
      { id: "a-1042-2", actor: "Grace N.", action: "Assigned for verification", createdAt: "12 Sep · 08:48" },
    ],
  },
  {
    id: "TUL-1041",
    receivedAt: "2026-09-12T05:11:00.000Z",
    status: "new",
    priority: "normal",
    language: "en",
    summary: "Can I access child health services this afternoon?",
    requestedService: "Child health services",
    callerReference: "Caller · English",
    facilityId: "facility-north-ridge-demo",
    facilityName: "Tulu North Ridge Demo Health Centre",
    assignedTo: "You",
    verification: { state: "unverified" },
    notes: [],
    auditEvents: [{ id: "a-1041-1", actor: "Tulu voice agent", action: "Request received", createdAt: "12 Sep · 08:11" }],
  },
  {
    id: "TUL-1040",
    receivedAt: "2026-09-12T04:26:00.000Z",
    status: "in_review",
    priority: "normal",
    language: "en",
    summary: "Does the clinic have a nurse on duty?",
    requestedService: "Clinical staff availability",
    callerReference: "Caller · English",
    facilityId: "facility-north-ridge-demo",
    facilityName: "Tulu North Ridge Demo Health Centre",
    assignedTo: "You",
    verification: { state: "partially_verified", lastVerifiedAt: "12 Sep 2026 · 07:35", verifiedBy: "Grace N." },
    notes: [{ id: "n-1040-1", author: "You", body: "Checking the duty roster before responding.", createdAt: "12 Sep · 08:02" }],
    auditEvents: [
      { id: "a-1040-1", actor: "Tulu voice agent", action: "Request received", createdAt: "12 Sep · 07:26" },
      { id: "a-1040-2", actor: "You", action: "Review started", createdAt: "12 Sep · 08:02" },
    ],
  },
  {
    id: "TUL-1039",
    receivedAt: "2026-09-12T03:40:00.000Z",
    status: "awaiting_clarification",
    priority: "normal",
    language: "sw",
    summary: "Caller needs help choosing the right service.",
    requestedService: "Service navigation",
    callerReference: "Caller · Kiswahili",
    facilityId: "facility-north-ridge-demo",
    facilityName: "Tulu North Ridge Demo Health Centre",
    verification: { state: "unverified" },
    notes: [{ id: "n-1039-1", author: "Peter L.", body: "The caller needs to clarify whether this is a routine or urgent visit.", createdAt: "12 Sep · 07:55" }],
    auditEvents: [{ id: "a-1039-1", actor: "Peter L.", action: "Clarification requested", createdAt: "12 Sep · 07:55" }],
  },
  {
    id: "TUL-1038",
    receivedAt: "2026-09-12T02:58:00.000Z",
    status: "escalated",
    priority: "urgent",
    language: "en",
    summary: "Caller is asking about a medicine not listed in the demo inventory.",
    requestedService: "Unlisted medicine availability",
    callerReference: "Caller · English",
    facilityId: "facility-north-ridge-demo",
    facilityName: "Tulu North Ridge Demo Health Centre",
    assignedTo: "Grace N.",
    verification: { state: "stale", lastVerifiedAt: "10 Sep 2026 · 14:20", verifiedBy: "Joseph K." },
    notes: [{ id: "n-1038-1", author: "Grace N.", body: "Escalated because stock information is older than the freshness threshold.", createdAt: "12 Sep · 07:44" }],
    auditEvents: [
      { id: "a-1038-1", actor: "Tulu voice agent", action: "Request received", createdAt: "12 Sep · 05:58" },
      { id: "a-1038-2", actor: "Grace N.", action: "Escalated for stock verification", createdAt: "12 Sep · 07:44" },
    ],
  },
  {
    id: "TUL-1037",
    receivedAt: "2026-09-12T01:18:00.000Z",
    status: "resolved",
    priority: "normal",
    language: "sw",
    summary: "Caller confirmed general consultation availability.",
    requestedService: "General consultation",
    callerReference: "Caller · Kiswahili",
    facilityId: "facility-north-ridge-demo",
    facilityName: "Tulu North Ridge Demo Health Centre",
    assignedTo: "Peter L.",
    verification: { state: "verified", lastVerifiedAt: "12 Sep 2026 · 06:52", verifiedBy: "Peter L." },
    notes: [],
    auditEvents: [
      { id: "a-1037-1", actor: "Tulu voice agent", action: "Request received", createdAt: "12 Sep · 04:18" },
      { id: "a-1037-2", actor: "Peter L.", action: "Information confirmed", createdAt: "12 Sep · 06:52" },
      { id: "a-1037-3", actor: "Peter L.", action: "Request resolved", createdAt: "12 Sep · 06:55" },
    ],
  },
];
