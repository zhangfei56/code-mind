/** Trace/eval helpers for compaction summary recall (no LLM). */

export interface CompactionRecallAnchor {
  id: string;
  /** Case-insensitive substring or RegExp tested against summary Markdown. */
  pattern: string | RegExp;
  /** When true, missing anchor fails the eval (default true). */
  required?: boolean;
}

export interface CompactionRecallScore {
  total: number;
  matched: number;
  missing: string[];
  hitRate: number;
}

function anchorMatches(summary: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(summary);
  }
  return summary.toLowerCase().includes(pattern.toLowerCase());
}

/** Score how many required anchors appear in a compaction summary. */
export function scoreCompactionSummaryRecall(
  summary: string,
  anchors: CompactionRecallAnchor[],
): CompactionRecallScore {
  const required = anchors.filter((anchor) => anchor.required !== false);
  const missing: string[] = [];
  let matched = 0;

  for (const anchor of required) {
    if (anchorMatches(summary, anchor.pattern)) {
      matched += 1;
    } else {
      missing.push(anchor.id);
    }
  }

  const total = required.length;
  return {
    total,
    matched,
    missing,
    hitRate: total === 0 ? 1 : matched / total,
  };
}

/** Minimum hit rate for CI trace eval (fixed fixture). */
export const COMPACTION_EVAL_MIN_HIT_RATE = 0.75;
