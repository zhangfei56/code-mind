import { writeFile } from "node:fs/promises";

export async function writeSummary(
  summaryPath: string,
  summary: string,
): Promise<void> {
  await writeFile(summaryPath, summary, "utf8");
}
