import type { ActivityKind } from "@code-mind/shared";
import { activityLabel } from "@code-mind/shared";

/** Human-readable step titles derived from activity, not workflow phase. */
export function stepTitleForActivity(activity: ActivityKind): string {
  return activityLabel(activity);
}

export function formatStepHeader(
  step: number,
  maxSteps: number,
  activity: ActivityKind,
  detail?: string,
): string {
  const title = stepTitleForActivity(activity);
  if (detail && detail.length > 0) {
    return `Step ${step}/${maxSteps} ${title} · ${detail}`;
  }
  return `Step ${step}/${maxSteps} ${title}`;
}
