import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

interface SwebenchRow {
  row: {
    instance_id: string;
    repo: string;
    base_commit: string;
    problem_statement: string;
    version?: string;
  };
}

interface SwebenchApiResponse {
  rows: SwebenchRow[];
  num_rows_total: number;
}

const HF_ROWS_URL =
  "https://datasets-server.huggingface.co/rows?dataset=SWE-bench/SWE-bench_Lite&config=default&split=dev";

async function fetchAllDevInstances(): Promise<SwebenchRow["row"][]> {
  const first = (await fetch(`${HF_ROWS_URL}&offset=0&length=100`)).json() as Promise<SwebenchApiResponse>;
  const data = await first;
  const total = data.num_rows_total;
  const rows = [...data.rows.map((entry) => entry.row)];

  for (let offset = rows.length; offset < total; offset += 100) {
    const page = (await fetch(`${HF_ROWS_URL}&offset=${offset}&length=100`)).json() as Promise<SwebenchApiResponse>;
    const payload = await page;
    rows.push(...payload.rows.map((entry) => entry.row));
  }
  return rows;
}

function toWorkloadCase(row: SwebenchRow["row"]) {
  const slug = row.instance_id.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return {
    id: `swebench-${slug}`,
    tier: "external" as const,
    category: "github-issue",
    mode: "agent" as const,
    workspace: ".",
    prompt: row.problem_statement.trim(),
    goal: `Resolve ${row.instance_id}: failing tests should pass after fix.`,
    maxSteps: 30,
    swebench: {
      instanceId: row.instance_id,
      repo: row.repo,
      baseCommit: row.base_commit,
      ...(row.version ? { version: row.version } : {}),
    },
    graders: {
      forbiddenCompletion: ["stopped_by_limit"],
    },
    tags: ["swebench", "lite-dev"],
  };
}

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  const rows = await fetchAllDevInstances();
  console.log(`Fetched ${rows.length} SWE-bench Lite dev instances.`);

  const vendorDir = join(root, "benchmarks", "vendor");
  await mkdir(vendorDir, { recursive: true });

  const instancesPath = join(vendorDir, "swebench-dev-instances.json");
  await writeFile(instancesPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  console.log(`Saved ${instancesPath}`);

  const workload = rows.map(toWorkloadCase);
  const workloadPath = join(root, "benchmarks", "workloads", "t2-swebench-dev.json");
  await writeFile(workloadPath, `${JSON.stringify(workload, null, 2)}\n`, "utf8");
  console.log(`Saved ${workloadPath} (${workload.length} cases)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
