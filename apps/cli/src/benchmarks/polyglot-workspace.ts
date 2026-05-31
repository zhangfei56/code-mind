import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BenchmarkCase, PolyglotRef } from "./benchmark-types.js";
import { createIsolatedWorkspace } from "./benchmark-workspace.js";

const POLYGLOT_ROOT = "benchmarks/vendor/polyglot-benchmark";

export function polyglotExerciseDir(root: string, ref: PolyglotRef): string {
  return join(root, POLYGLOT_ROOT, ref.language, "exercises", "practice", ref.exercise);
}

export async function readPolyglotInstructions(
  root: string,
  ref: PolyglotRef,
): Promise<string> {
  const instructionsPath = join(polyglotExerciseDir(root, ref), ".docs", "instructions.md");
  const raw = await readFile(instructionsPath, "utf8");
  const body = raw.replace(/^#\s+Instructions\s*\n+/i, "").trim();
  return [
    `Implement the ${ref.exercise} exercise (${ref.language}).`,
    "Edit the main source file in this workspace so all tests pass.",
    "",
    body,
  ].join("\n");
}

function defaultPolyglotVerifyCommand(ref: PolyglotRef): string {
  if (ref.language === "python") {
    return "python3 -m pytest -q";
  }
  if (ref.language === "javascript") {
    return "npm install --silent && npm test -- --runInBand";
  }
  if (ref.language === "go") {
    return "go test ./...";
  }
  if (ref.language === "rust") {
    return "cargo test --quiet";
  }
  return "echo 'unsupported polyglot language' && exit 1";
}

export function resolvePolyglotGraders(
  item: BenchmarkCase,
  ref: PolyglotRef,
): NonNullable<BenchmarkCase["graders"]> {
  return {
    verifyCommand: item.graders?.verifyCommand ?? defaultPolyglotVerifyCommand(ref),
    verifyExitCode: item.graders?.verifyExitCode ?? 0,
    maxSteps: item.graders?.maxSteps ?? item.maxSteps ?? 20,
    forbiddenCompletion: item.graders?.forbiddenCompletion ?? ["stopped_by_limit"],
    ...item.graders,
  };
}

export async function preparePolyglotWorkspace(
  root: string,
  item: BenchmarkCase,
  ref: PolyglotRef,
): Promise<{ workspaceRoot: string; cleanup: () => Promise<void>; prompt: string; graders: NonNullable<BenchmarkCase["graders"]> }> {
  const sourceDir = polyglotExerciseDir(root, ref);
  const isolated = await createIsolatedWorkspace(sourceDir, item.id);
  const prompt =
    item.prompt.trim().length > 0
      ? item.prompt
      : await readPolyglotInstructions(root, ref);
  return {
    workspaceRoot: isolated.workspaceRoot,
    cleanup: isolated.cleanup,
    prompt,
    graders: resolvePolyglotGraders(item, ref),
  };
}

export async function prepareProductCaseWorkspace(
  root: string,
  item: BenchmarkCase,
  caseDir: string,
): Promise<{ workspaceRoot: string; cleanup: () => Promise<void>; prompt: string }> {
  const productRoot = join(root, "benchmarks", "cases", "product", caseDir);
  const workspaceSource = join(productRoot, "workspace");
  const isolated = await createIsolatedWorkspace(workspaceSource, item.id);
  const instructionPath = join(productRoot, "instruction.md");
  let prompt = item.prompt;
  if (prompt.trim().length === 0) {
    prompt = (await readFile(instructionPath, "utf8")).trim();
  }
  return { workspaceRoot: isolated.workspaceRoot, cleanup: isolated.cleanup, prompt };
}
