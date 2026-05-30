import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createLoopPolicy } from "@code-mind/core";
import { ValidationError } from "@code-mind/shared";
import { parseInteractiveCommand } from "../../apps/cli/src/interactive/commands.js";

const ROOT = join(import.meta.dirname, "../..");

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".agent") {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectSourceFiles(fullPath, acc);
      continue;
    }
    if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function grepSources(pattern: RegExp, exclude?: RegExp): string[] {
  const matches: string[] = [];
  const dirs = ["packages", "apps"].map((part) => join(ROOT, part));
  for (const dir of dirs) {
    for (const file of collectSourceFiles(dir)) {
      if (
        exclude?.test(file) ||
        file.endsWith("tests/regression/no-keyword-classification.test.ts")
      ) {
        continue;
      }
      const content = readFileSync(file, "utf8");
      if (pattern.test(content)) {
        matches.push(file.replace(`${ROOT}/`, ""));
      }
    }
  }
  return matches;
}

export function runNoKeywordClassificationTests(): void {
  assert.throws(
    () => parseInteractiveCommand("/mode ask"),
    ValidationError,
    "SEC-07",
  );

  const askWithRepairPrompt = createLoopPolicy({
    id: "sec_01",
    text: "请修复测试失败",
    cwd: "/tmp/demo",
    mode: "ask",
    maxSteps: 8,
  });
  assert.equal(askWithRepairPrompt.mode, "ask", "SEC-01");

  const editWithAnalysisPrompt = createLoopPolicy({
    id: "sec_03",
    text: "分析架构",
    cwd: "/tmp/demo",
    mode: "edit",
    maxSteps: 8,
  });
  assert.equal(editWithAnalysisPrompt.mode, "edit", "SEC-03");

  const classifyTaskHits = grepSources(/\bclassifyTask\s*\(/);
  assert.deepEqual(classifyTaskHits, [], `SEC-04 classifyTask found in: ${classifyTaskHits.join(", ")}`);

  const taskKindHits = grepSources(/\bTaskKind\b/);
  assert.deepEqual(taskKindHits, [], `SEC-05 TaskKind found in: ${taskKindHits.join(", ")}`);

  const runModeHits = grepSources(/\bRunMode\b/);
  assert.deepEqual(runModeHits, [], `SEC-05 RunMode found in: ${runModeHits.join(", ")}`);

  const hookRunModeHits = grepSources(/\brunMode\s*:/);
  assert.deepEqual(
    hookRunModeHits,
    [],
    `SEC-06 runMode field found in: ${hookRunModeHits.join(", ")}`,
  );

  const legacyModes = grepSources(/"read_only"|"auto_edit"|"full_auto"|"sandbox_auto"/);
  assert.deepEqual(
    legacyModes,
    [],
    `SEC-05 legacy modes found in: ${legacyModes.join(", ")}`,
  );
}
