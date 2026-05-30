/** Extract executable plan steps from markdown-ish plan text. */
export function extractPlanSteps(planText: string): string[] {
  const lines = planText.trim().split("\n");
  const steps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      continue;
    }

    const numbered = trimmed.match(/^(?:\d+[.)]|[-*+])\s+(.+)$/);
    if (numbered?.[1]) {
      steps.push(numbered[1].trim());
      continue;
    }

    if (steps.length === 0 && trimmed.length > 0 && !trimmed.endsWith(":")) {
      steps.push(trimmed);
    }
  }

  return steps.filter(Boolean).slice(0, 12);
}

export function renderFormattedPlan(planText: string): string {
  const body = planText.trim();
  if (!body) {
    return "";
  }

  const steps = extractPlanSteps(body);
  if (steps.length >= 2) {
    return ["Plan", ...steps.map((step, index) => `  ${index + 1}. ${step}`), ""].join("\n");
  }

  return ["Plan", body, ""].join("\n");
}
