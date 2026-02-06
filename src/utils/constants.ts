export const CyclePhase = {
  DECLARATION: "declaration",
  PRODUCTION: "production",
  REVIEW: "review",
  CLOSED: "closed",
} as const;

export type CyclePhase = (typeof CyclePhase)[keyof typeof CyclePhase];

export const MemberState = {
  ACTIVE: "active",
  OBSERVER: "observer",
} as const;

export type MemberState = (typeof MemberState)[keyof typeof MemberState];

export const EventType = {
  CYCLE_OPENED: "cycle_opened",
  CYCLE_CLOSED: "cycle_closed",
  DECLARATION_SUBMITTED: "declaration_submitted",
  DECLARATION_DEADLINE_PASSED: "declaration_deadline_passed",
  DELIVERY_SUBMITTED: "delivery_submitted",
  REVIEW_ASSIGNED: "review_assigned",
  REVIEW_SUBMITTED: "review_submitted",
  TEACHBACK_REGISTERED: "teachback_registered",
  MEMBER_STATE_CHANGED: "member_state_changed",
  REMINDER_SENT: "reminder_sent",
  REPORT_GENERATED: "report_generated",
  CONFIG_UPDATED: "config_updated",
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export const PRESENCE_THRESHOLD = 2;
export const CONSECUTIVE_FAIL_LIMIT = 2;
export const REVIEWERS_PER_DELIVERY = 2;
