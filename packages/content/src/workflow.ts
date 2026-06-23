// @govcore/content/workflow — the shared draft → published → archived lifecycle.
//
// Every engine-defined content type reuses this one small state machine
// (promoted from the @govea/core `workflow` stub). The compiled table carries a
// `status` column constrained to these states; transitions are enforced here.

export const WORKFLOW_STATUSES = ['draft', 'published', 'archived'] as const
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]

export const DEFAULT_WORKFLOW_STATUS: WorkflowStatus = 'draft'

const TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  draft: ['published'],
  published: ['draft', 'archived'],
  archived: [],
}

/** Whether `from → to` is an allowed lifecycle transition. */
export function canTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** The states reachable from `from` in one step. */
export function allowedTransitions(from: WorkflowStatus): WorkflowStatus[] {
  return [...TRANSITIONS[from]]
}
