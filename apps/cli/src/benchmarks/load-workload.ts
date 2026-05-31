import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BenchmarkCase, BenchmarkGraders } from "./benchmark-types.js";

interface ProductCaseManifest {
  id: string;
  mode: BenchmarkCase["mode"];
  goal: string;
  maxSteps?: number;
  prepareCommand?: string;
  graders?: BenchmarkGraders;
  tags?: string[];
  source?: string;
}

export async function loadProductCaseManifest(
  root: string,
  caseDir: string,
): Promise<ProductCaseManifest> {
  const manifestPath = join(root, "benchmarks", "cases", "product", caseDir, "case.json");
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as ProductCaseManifest;
}

export async function loadWorkloadCases(
  root: string,
  workloadRelativePath: string,
): Promise<BenchmarkCase[]> {
  const workloadPath = join(root, "benchmarks", workloadRelativePath);
  const raw = await readFile(workloadPath, "utf8");
  const cases = JSON.parse(raw) as BenchmarkCase[];

  const resolved: BenchmarkCase[] = [];
  for (const item of cases) {
    if (item.productCase) {
      const manifest = await loadProductCaseManifest(root, item.productCase);
      resolved.push({
        ...item,
        id: item.id || manifest.id,
        mode: item.mode ?? manifest.mode,
        goal: item.goal || manifest.goal,
        workspace: join("benchmarks/cases/product", item.productCase, "workspace"),
        prompt: item.prompt,
        ...(item.maxSteps ?? manifest.maxSteps
          ? { maxSteps: item.maxSteps ?? manifest.maxSteps }
          : {}),
        ...(item.prepareCommand ?? manifest.prepareCommand
          ? { prepareCommand: item.prepareCommand ?? manifest.prepareCommand }
          : {}),
        graders: { ...manifest.graders, ...item.graders },
        ...(item.tags ?? manifest.tags ? { tags: item.tags ?? manifest.tags } : {}),
        ...(item.source ?? manifest.source ? { source: item.source ?? manifest.source } : {}),
      });
      continue;
    }
    resolved.push(item);
  }
  return resolved;
}
