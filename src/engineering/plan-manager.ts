import { existsSync } from "node:fs";
import { join } from "node:path";
import { createId } from "../shared/ids.js";
import type {
  AgentPlan,
  EngineeringRiskLevel,
  PatchPlan,
  PlannedFileChange,
  PlannedPatch,
  VerificationStep,
} from "../shared/types.js";
import { classifyTaskTemplate } from "./task-template.js";

function detectCandidateFiles(workspaceRoot: string): PlannedFileChange[] {
  const candidates = [
    "src",
    "tests",
    "docs",
    "package.json",
    "README.md",
  ];

  return candidates
    .filter((entry) => existsSync(join(workspaceRoot, entry)))
    .map((path) => ({
      path,
      action: path === "package.json" || path === "README.md" ? "modify" : "read",
      reason: "Likely relevant area for engineering tasks.",
      riskLevel: path === "package.json" ? "high" : "medium",
    })) satisfies PlannedFileChange[];
}

function buildVerification(template: ReturnType<typeof classifyTaskTemplate>): VerificationStep[] {
  switch (template) {
    case "bug_fix":
      return [
        { description: "Run unit tests", command: "npm test", required: true },
        { description: "Review final diff", tool: "git_diff", required: true },
      ];
    case "refactor":
      return [
        { description: "Run unit tests", command: "npm test", required: true },
        { description: "Run lint if available", command: "npm run lint", required: false },
        { description: "Review final diff", tool: "git_diff", required: true },
      ];
    case "add_feature":
      return [
        { description: "Run tests", command: "npm test", required: true },
        { description: "Run build if available", command: "npm run build", required: false },
      ];
    case "write_tests":
      return [
        { description: "Run tests", command: "npm test", required: true },
      ];
    case "code_review":
      return [
        { description: "Inspect current diff", tool: "git_diff", required: true },
      ];
  }
}

function guessRiskLevel(task: string): EngineeringRiskLevel {
  const normalized = task.toLowerCase();
  if (
    normalized.includes("auth") ||
    normalized.includes("token") ||
    normalized.includes("payment") ||
    normalized.includes("security")
  ) {
    return "high";
  }
  if (normalized.includes("refactor") || normalized.includes("重构")) {
    return "medium";
  }
  return "low";
}

export class PlanManager {
  createPlan(task: string, workspaceRoot: string): AgentPlan {
    const template = classifyTaskTemplate(task);
    const affectedFiles = detectCandidateFiles(workspaceRoot);
    const verification = buildVerification(template);
    const planId = createId("plan");

    const steps = [
      {
        id: "step_1",
        title: "Analyze relevant files",
        description: "Inspect source, tests, and project rules before modifying code.",
        status: "pending",
        expectedFiles: affectedFiles.map((file) => file.path),
      },
      {
        id: "step_2",
        title: "Prepare focused change set",
        description: "Split the work into small patches and keep unrelated files unchanged.",
        status: "pending",
        expectedFiles: affectedFiles
          .filter((file) => file.path.startsWith("src") || file.path.startsWith("tests"))
          .map((file) => file.path),
      },
      {
        id: "step_3",
        title: "Verify and review",
        description: "Run verification commands and review the final diff.",
        status: "pending",
        verification: verification.map((step) => step.command ?? step.tool ?? step.description),
      },
    ] as const;

    return {
      id: planId,
      task,
      summary: `Plan the task as a ${template} workflow and execute it in small verified steps.`,
      riskLevel: guessRiskLevel(task),
      affectedFiles,
      steps: [...steps],
      verification,
      rollback: {
        summary: "Revert the affected files or discard the worktree if verification fails.",
        steps: [
          "Review git diff before rollback.",
          "Restore modified files or delete the isolated worktree.",
          "Re-run verification to confirm a clean state.",
        ],
      },
    };
  }

  createPatchPlan(plan: AgentPlan): PatchPlan {
    const patches: PlannedPatch[] = plan.steps.map((step, index) => ({
      id: `patch_${index + 1}`,
      description: step.title,
      targetFiles: step.expectedFiles ?? [],
      dependencies: index === 0 ? [] : [`patch_${index}`],
      ...(step.verification === undefined ? {} : { verification: step.verification }),
    }));

    return {
      planId: plan.id,
      patches,
    };
  }

  renderMarkdown(plan: AgentPlan): string {
    return [
      "# 修改计划",
      "",
      "## 任务",
      "",
      plan.task,
      "",
      "## 摘要",
      "",
      plan.summary,
      "",
      "## 影响文件",
      "",
      ...plan.affectedFiles.map(
        (file) => `- \`${file.path}\`：${file.action}，${file.reason}`,
      ),
      "",
      "## 执行步骤",
      "",
      ...plan.steps.map(
        (step, index) => `${index + 1}. ${step.title}：${step.description}`,
      ),
      "",
      "## 验证",
      "",
      ...plan.verification.map(
        (step) => `- ${step.command ?? step.tool ?? step.description}`,
      ),
    ].join("\n");
  }
}
