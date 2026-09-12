# Tulu Facility Dashboard — Design Brief

**Status:** Proposed
**Scope:** Initial facility-dashboard MVP
**Application:** `apps/main-dash`
**Framework direction:** Next.js with the App Router, TypeScript, and shared contracts from `packages/shared`

## 1. Purpose

The facility dashboard is the operational workspace for authorized healthcare staff who respond to requests raised through Tulu's voice experience.

Its primary job is to help a staff member answer three questions quickly and safely:

1. What does this caller need?
2. What information still needs verification?
3. What is the safest next action?

The dashboard is not a clinical-record system, diagnostic tool, or replacement for facility workflows. It coordinates access, verification, and follow-up.

## 2. Design principles

### Clarity before speed

The interface should make the current state, owner, freshness of information, and next action obvious at a glance.

### Verified information is distinct from suggestions

AI-generated findings, caller statements, and staff-confirmed facts must use visibly different labels and visual treatments. A green status must never mean "the system guessed yes."

### Human review is a feature

Requests that require staff judgment should be presented as normal, responsible handoffs—not as system failures.

### Calm urgency

Prioritize requests using clear, explainable signals such as age, stated urgency, and information freshness. Avoid alarm-heavy visuals or artificial countdowns.

### Safe defaults and deliberate high-impact actions

Routine review should be quick. Confirming, rejecting, escalating, or changing operational information should be explicit, reversible where possible, and recorded in the audit history.

### Reduce wasted journeys

The dashboard should keep the human outcome in view: helping a caller avoid an unnecessary or unsuccessful trip to a facility.

## 3. Initial users and roles

These roles are an initial product assumption and should be validated with the project team.

| Role | Initial capabilities |
| --- | --- |
| Facility staff | View assigned and shared requests; add notes; verify information; update request status |
| Supervisor | All staff capabilities; assign requests; approve sensitive confirmations; escalate cases |
| Facility admin | All supervisor capabilities; manage facility information and staff access |

Authorization must be enforced on the server. Hiding an action in the interface is not sufficient protection.

## 4. MVP user journeys

### Sign in

1. Staff member opens the dashboard.
2. During the initial UI build, the user enters the synthetic demo workspace directly.
3. The request queue is the default landing screen.
4. The header shows the current demo user, facility, role, and sign-out placeholder.

Production authentication will use Auth0 through the official Next.js SDK. Auth0 is intentionally inactive while the initial dashboard workflow and agent API contract are being built.

### Review the request queue

The queue is the default landing screen. It should show:

- Request reference and received time.
- Short, plain-language summary.
- Requested service or information.
- Current status.
- Verification state and freshness.
- Assigned staff member.
- One recommended next action.

Default ordering should favor requests that are older, awaiting staff verification, or explicitly marked urgent. The ordering must be explainable.

### Review a request

The request detail view should present information in this order:

1. Caller need and requested outcome.
2. Current status and recommended next action.
3. Facility information relevant to the request.
4. What is verified, unverified, or stale.
5. Staff actions and notes.
6. Audit history.

Sensitive or ambiguous requests should make the human-handoff path prominent.

### Complete an action

The initial action set is:

- Confirm information.
- Mark information as unavailable or incorrect.
- Request clarification.
- Escalate to a supervisor or another team.
- Assign or reassign the request.
- Add an internal note.
- Resolve the request after the outcome is recorded.

Actions that materially affect caller expectations must require an explicit confirmation and a reason where appropriate.

## 5. Request lifecycle

The proposed initial statuses are:

| Status | Meaning |
| --- | --- |
| `new` | Request has arrived and has not been reviewed |
| `in_review` | A staff member is actively reviewing the request |
| `needs_verification` | A facility fact or operational detail needs confirmation |
| `awaiting_clarification` | The request cannot safely proceed without more information |
| `confirmed` | The relevant information has been verified by an authorized staff member |
| `rejected` | The relevant service or availability has been verified as unavailable |
| `escalated` | The request needs a supervisor, specialist, or human follow-up |
| `resolved` | The operational outcome has been recorded and no further action is pending |

Statuses should be defined in `packages/shared` so the caller, dashboard, and future agent API use the same vocabulary.

## 6. Information architecture

Initial routes:

```text
/login
/dashboard
/dashboard/requests
/dashboard/requests/[requestId]
/dashboard/facility
```

MVP navigation:

- Requests
- Facility information
- Staff profile and sign out

These areas can be expanded later for inventory, reports, user administration, and system settings.

## 7. Visual direction

The dashboard should extend the existing Tulu caller experience rather than introduce a separate brand language.

- Deep charcoal and forest-green foundation.
- Warm ochre used sparingly for context and secondary emphasis.
- Green reserved for verified or successfully completed states.
- Red reserved for genuine risk, failure, or destructive actions.
- Neutral surfaces and borders should carry most of the hierarchy.
- Use compact status badges, readable tables, and generous detail-panel spacing.
- Favor plain language over internal system terminology.

The visual tone should feel dependable, humane, and operational—not like a generic analytics console.

## 8. Behavioral design patterns

- Show the last verified time and verifying staff member wherever freshness matters.
- Give each request one primary next action rather than presenting a wall of equal buttons.
- Use truthful progress counts such as requests awaiting verification or resolved today.
- Make ownership visible to reduce ambiguity.
- Preserve uncertainty instead of forcing a premature yes/no answer.
- Use short factual context about the caller's need, without inventing emotional details.
- Never use fabricated scarcity, social proof, or urgency to pressure staff into unsafe decisions.

## 9. Conceptual request data

The initial UI model should support these fields without requiring real patient-identifying data:

```ts
type Request = {
  id: string;
  receivedAt: string;
  status: RequestStatus;
  priority: "normal" | "urgent";
  language: "en" | "sw";
  summary: string;
  requestedService?: string;
  callerReference?: string;
  facilityId: string;
  assignedTo?: string;
  verification: {
    state: "unverified" | "partially_verified" | "verified" | "stale";
    lastVerifiedAt?: string;
    verifiedBy?: string;
  };
  notes: Note[];
  auditEvents: AuditEvent[];
};
```

This is a design model, not yet the final shared contract. The implementation should keep mock data behind a repository or API adapter so the future agent API can replace it cleanly.

## 10. Authentication and privacy

- Protect all `/dashboard/*` routes once Auth0 is activated; the current demo intentionally leaves them open.
- Use Auth0 for login, logout, session handling, and the identity boundary once the workflow is ready for real staff.
- Keep Auth0 application secrets in `.env.local` or the deployment platform's secret manager; never commit them.
- Represent facility roles and permissions using a documented Auth0 claim strategy before production use.
- Keep session and authorization decisions server-side.
- Include the acting user in every state-changing audit event.
- Do not place API keys, database credentials, or privileged agent logic in the browser.
- Use synthetic data during development.
- Minimize caller information shown in the queue; reveal additional details only when operationally necessary.
- Add clear loading, error, expired-session, and unauthorized states.

## 11. Accessibility and resilience

- Keyboard-accessible navigation and actions.
- Visible focus states and sufficient color contrast.
- Status conveyed by text and icons, not color alone.
- Responsive layout for laptops and smaller screens.
- Empty, loading, error, stale-data, and offline-like states designed explicitly.
- Confirmation dialogs that state the consequence of the action in plain language.

## 12. MVP non-goals

The first dashboard version will not include:

- Real telephony or live voice streaming.
- Production Auth0 tenant and role configuration.
- Real patient records or clinical decision support.
- Automated appointment booking.
- Full inventory management.
- Advanced analytics or reporting.
- Emergency dispatch.

## 13. Implementation sequence

1. Scaffold `apps/main-dash` as a Next.js workspace package.
2. Add shared request statuses and TypeScript contracts to `packages/shared`.
3. Keep the current synthetic demo session while the UI is built; add Auth0 login/logout plumbing and protected dashboard routes afterward.
4. Build the authenticated shell and request queue.
5. Build request detail, verification states, actions, notes, and audit history.
6. Add facility information editing with clear mock-data labels.
7. Add responsive and accessibility checks.
8. Replace mock repositories with the agent API when its contract exists.

## 14. Open decisions before production

- Which identity provider will be used?
- Is a staff member associated with one facility or multiple facilities?
- Which actions require supervisor approval?
- How should urgency be defined and who may set it?
- What caller information may be retained and for how long?
- Which facility facts require periodic re-verification?
- What is the escalation response target for each request type?
