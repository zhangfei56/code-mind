import type { AgentPlan } from "@code-mind/shared";
import { buildRuntimePlan } from "@code-mind/core";
import { confirmAction } from "../ui/prompt.js";
import { theme } from "../ui/theme.js";

export function renderPlanApprovalPreview(
  planText: string,
  structuredPlan?: AgentPlan,
): string[] {
  const lines = planText.trim().split("\n");
  const preview = lines.slice(0, 24);
  const structured: string[] = [];

  if (structuredPlan) {
    structured.push(
      theme.bold("Structured plan"),
      `  Summary: ${structuredPlan.summary}`,
      `  Risk: ${structuredPlan.riskLevel}`,
      `  Steps: ${structuredPlan.steps.length}`,
      ...(structuredPlan.affectedFiles.length > 0
        ? [
            `  Files: ${structuredPlan.affectedFiles
              .slice(0, 6)
              .map((file) => `${file.path} (${file.action})`)
              .join(", ")}${structuredPlan.affectedFiles.length > 6 ? "…" : ""}`,
          ]
        : []),
      ...(structuredPlan.verification.length > 0
        ? [
            `  Verify: ${structuredPlan.verification
              .slice(0, 4)
              .map((step) => step.command ?? step.description)
              .join(" · ")}`,
          ]
        : []),
      "",
    );
  }

  return [
    theme.bold("Plan approval"),
    "",
    ...structured,
    ...preview.map((line) => `  ${line}`),
    ...(lines.length > preview.length
      ? [`  ${theme.dim(`... ${lines.length - preview.length} more lines`)}`]
      : []),
    "",
  ];
}

export async function confirmPlanApproval(planText: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }
  const { plan } = buildRuntimePlan(
    { id: "plan_preview", text: "Plan approval preview", cwd: ".", mode: "plan", maxSteps: 1 },
    planText,
  );
  console.log(renderPlanApprovalPreview(planText, plan).join("\n"));
  return confirmAction("Approve this plan?", { showApprovalChoices: false });
}

export function createInteractivePlanApprovalHandler(): (
  request: { planSessionId: string; planText: string },
) => Promise<boolean> {
  return async ({ planText }) => confirmPlanApproval(planText);
}
