import { createId } from "@code-mind/shared";
import type {
  AgentPlan,
  EngineeringRiskLevel,
  PlannedFileChange,
  PlanStep,
  UserTask,
  VerificationStep,
} from "@code-mind/shared";

const LIST_MARKER_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+|\[[ xX]\]\s*)/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+/;
const PATH_RE =
  /(?:^|[\s(`"'[{<])((?:\.{1,2}\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9]+)?)(?=$|[\s)`"',\]}>:;])/g;
const COMMAND_RE =
  /`((?:pnpm|npm|yarn|bun|cargo|go|pytest|python|tsc|eslint|vitest|jest)[^`]{0,180})`|(?:^|\s)((?:pnpm|npm|yarn|bun|cargo|go test|pytest|python -m pytest|tsc|eslint|vitest|jest)(?:\s+[^.;\n]+)?)/gi;

function cleanLine(line: string): string {
  return line.replace(LIST_MARKER_RE, "").trim();
}

function splitMeaningfulLines(planText: string): string[] {
  return planText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !HEADING_RE.test(line));
}

function firstSentence(text: string): string {
  return text.split(/(?<=[.!?。！？])\s+/)[0]?.trim() || text.trim();
}

function extractSummary(planText: string): string {
  const lines = splitMeaningfulLines(planText);
  const firstContent = lines.find((line) => !LIST_MARKER_RE.test(line)) ?? lines[0];
  return firstContent ? firstSentence(cleanLine(firstContent)) : planText.trim();
}

function extractPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(PATH_RE)) {
    const value = match[1]?.replace(/^[`'"]|[`'"]$/g, "");
    if (!value || value.includes("://")) {
      continue;
    }
    paths.add(value);
  }
  return [...paths];
}

function actionForLine(line: string): PlannedFileChange["action"] {
  if (/\b(delete|remove|drop)\b/i.test(line)) {
    return "delete";
  }
  if (/\b(create|add|new|introduce)\b/i.test(line)) {
    return "create";
  }
  if (/\b(read|inspect|review|check|find|locate)\b/i.test(line)) {
    return "read";
  }
  return "modify";
}

function riskForText(text: string): EngineeringRiskLevel {
  if (/\b(secret|credential|token|payment|auth|permission|security|migration|delete|drop|production|deploy|push|critical)\b/i.test(text)) {
    return "high";
  }
  if (/\b(refactor|schema|database|api|config|dependency|build|ci|workflow)\b/i.test(text)) {
    return "medium";
  }
  if (/\b(read|inspect|document|comment|format|typo)\b/i.test(text)) {
    return "low";
  }
  return "medium";
}

function maxRisk(left: EngineeringRiskLevel, right: EngineeringRiskLevel): EngineeringRiskLevel {
  const order: EngineeringRiskLevel[] = ["safe", "low", "medium", "high", "critical"];
  return order.indexOf(right) > order.indexOf(left) ? right : left;
}

function extractAffectedFiles(planText: string): PlannedFileChange[] {
  const files = new Map<string, PlannedFileChange>();
  for (const rawLine of splitMeaningfulLines(planText)) {
    const line = cleanLine(rawLine);
    for (const path of extractPaths(line)) {
      const riskLevel = riskForText(line);
      const existing = files.get(path);
      if (existing) {
        files.set(path, {
          ...existing,
          riskLevel: maxRisk(existing.riskLevel, riskLevel),
        });
        continue;
      }
      files.set(path, {
        path,
        action: actionForLine(line),
        reason: line,
        riskLevel,
      });
    }
  }
  return [...files.values()];
}

function extractVerification(planText: string): VerificationStep[] {
  const steps = new Map<string, VerificationStep>();
  for (const match of planText.matchAll(COMMAND_RE)) {
    const command = (match[1] ?? match[2] ?? "").trim().replace(/[),.;:]+$/, "");
    if (!command || steps.has(command)) {
      continue;
    }
    steps.set(command, {
      command,
      description: `Run ${command}`,
      required: true,
    });
  }

  if (steps.size === 0 && /\b(test|verify|verification|lint|typecheck|build)\b/i.test(planText)) {
    steps.set("verification", {
      description: "Run the project verification command detected by the runtime.",
      required: true,
    });
  }

  return [...steps.values()];
}

function extractPlanSteps(planText: string): PlanStep[] {
  const lines = splitMeaningfulLines(planText)
    .filter((line) => LIST_MARKER_RE.test(line))
    .map(cleanLine)
    .filter(Boolean);

  const candidates = lines.length > 0 ? lines : splitMeaningfulLines(planText).map(cleanLine);
  const steps = candidates
    .filter((line) => !/^(verification|verify|tests?|rollback)\s*:/i.test(line))
    .slice(0, 12)
    .map((line, index) => {
      const expectedFiles = extractPaths(line);
      const verification = extractVerification(line).map((item) => item.command ?? item.description);
      return {
        id: `step_${index + 1}`,
        title: firstSentence(line).slice(0, 96),
        description: line,
        status: "pending" as const,
        ...(expectedFiles.length === 0 ? {} : { expectedFiles }),
        ...(verification.length === 0 ? {} : { verification }),
      };
    });

  if (steps.length > 0) {
    return steps;
  }

  return [
    {
      id: "step_1",
      title: "Delivered plan",
      description: planText.trim(),
      status: "pending",
    },
  ];
}

function extractRollback(planText: string): AgentPlan["rollback"] | undefined {
  const rollbackLines = splitMeaningfulLines(planText)
    .map(cleanLine)
    .filter((line) => /\b(rollback|revert|undo|restore)\b/i.test(line));
  if (rollbackLines.length === 0) {
    return undefined;
  }
  return {
    summary: firstSentence(rollbackLines[0] ?? "Rollback changes if verification fails."),
    steps: rollbackLines.slice(0, 5),
  };
}

export function buildRuntimePlan(
  task: UserTask,
  planText: string,
): { plan: AgentPlan; markdown: string } {
  const trimmed = planText.trim();
  const affectedFiles = extractAffectedFiles(trimmed);
  const verification = extractVerification(trimmed);
  const riskLevel = affectedFiles.reduce<EngineeringRiskLevel>(
    (current, file) => maxRisk(current, file.riskLevel),
    riskForText(trimmed),
  );
  const rollback = extractRollback(trimmed);
  const plan: AgentPlan = {
    id: createId("plan"),
    task: task.text,
    summary: extractSummary(trimmed),
    riskLevel,
    affectedFiles,
    steps: extractPlanSteps(trimmed),
    verification,
    ...(rollback === undefined ? {} : { rollback }),
  };

  const markdown = ["# Plan", "", trimmed, ""].join("\n");
  return { plan, markdown };
}
