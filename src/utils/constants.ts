export const MemberState = {
  ACTIVE: "active",
  OBSERVER: "observer",
} as const;

export type MemberState = (typeof MemberState)[keyof typeof MemberState];

export const EventType = {
  CONFIG_UPDATED: "config_updated",
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export const INITIAL_REVIEW_CREDITS = 2;
export const REVIEW_CREDIT_COST = 1;
export const REVIEW_DEADLINE_HOURS = 24;
export const DEFAULT_PROJECT_DURATION_HOURS = 168;
export const MIN_PROJECT_DURATION_HOURS = 6;
export const MAX_PROJECT_DURATION_HOURS = 720;
export const PROJECT_FAILURE_PENALTY = 1;
export const INITIAL_BLACKHOLE_DAYS = 60;
export const FREEZE_DAYS_PER_YEAR = 30;
export const MAX_FREEZE_DAYS_PER_USE = 30;
export const XP_BASE_PER_PROJECT = 100;
export const XP_DIFFICULTY_MULTIPLIER = 40;
export const XP_AWARDED_DAY_MULTIPLIER = 5;
export const XP_PER_REVIEW_AS_EVALUATOR = 30;
export const XP_LEVEL_FACTOR = 120;

export const ReviewStage = {
  PRESENTATION: "presentation",
  FEEDBACK: "feedback",
  COUNTER_FEEDBACK: "counter_feedback",
  FINAL_ANALYSIS: "final_analysis",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "expired",
} as const;

export type ReviewStage = (typeof ReviewStage)[keyof typeof ReviewStage];

export const ProjectDifficultyDays = {
  1: 3,
  2: 5,
  3: 8,
  4: 12,
  5: 17,
} as const;
