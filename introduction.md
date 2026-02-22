# Welcome to Tomoyo Campus

Tomoyo Campus is a peer-driven project and review community.
You build real projects, present them in public, and improve through technical feedback.

## Main Goal

Create strong builders and reviewers by making project delivery and review quality fully visible and accountable.

## Core Flow

1. Start one project with `/project start`.
2. Deliver with `/delivery submit`.
3. A reviewer checks `/review open` and claims with `/review claim project_id:<id>`.
4. REI creates a public review thread with evaluatee and evaluator.
5. Conversation happens in that thread, open to community technical input.
6. Reviewer closes with `/review score project_id:<id> score:<0-5> difficulty:<1-5>`.
7. Evaluatee rates reviewer quality with `/review reviewer project_id:<id> user:@reviewer score:<0-5> comments:<text>`.

## Hard Rules

- One active project per user (`open` or `delivered`).
- One active review session per project.
- No self-review.
- The same evaluator cannot review the same project twice.
- Minimum passing project score is 3.
- Reviewer has 24 hours to close after claim.

## Evaluation Point Economy

- Everyone starts with 2 evaluation points.
- Claiming a review escrows 1 point from the evaluatee.
- Approved review (`score >= 3`): evaluator receives the escrowed point.
- Rejected review (`score <= 2`): evaluator still receives the escrowed point.
- Timeout (no score in 24h): evaluatee gets refund, evaluator loses 1 point, and 1 point is burned.
- `/pool` shows supply, escrow, burns, top holders, and economy health.

## Blackhole and Freeze

- Every user starts with a 60-day blackhole timer.
- Approved projects add days based on difficulty and delivery speed.
- Freeze allowance is 30 days/year and can be used with `/blackhole freeze`.
- While frozen, users cannot start projects or review actions.
- Use `/profile status` and `/blackhole status` to track progression.

## Transparency and History

- Reviews are public and non-anonymous.
- Review threads stay as server history.
- Reviewer quality scores (0-5) are permanent records.
- Use `/review log` for recent history or `/review log full:true` for full export.

## Delivery Requirements

Each delivery must include:

- README content (required)
- At least one artifact (link or attachment)

README criteria are validated by the evaluator during review. Attach `README_TEMPLATE.md` to guide submissions.

## Commands

- Projects: `/project start`, `/project status`, `/project list`, `/project concluded`
- Delivery: `/delivery submit`
- Reviews: `/review open`, `/review claim`, `/review score`, `/review reviewer`, `/review status`, `/review log`
- Progression: `/profile status`, `/profile gift`, `/blackhole status`, `/blackhole freeze`, `/pool`
