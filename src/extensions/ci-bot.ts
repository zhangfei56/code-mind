import { writeFileSync } from "node:fs";
import { GitManager } from "../engineering/git-manager.js";
import { ReviewEngine } from "../engineering/review-engine.js";

export class CiBot {
  async review(workspaceRoot: string, outputPath?: string): Promise<string> {
    const git = new GitManager();
    const changed = await git.changedFiles(workspaceRoot);
    const diff = await git.diff(workspaceRoot);
    const review = new ReviewEngine().review({
      task: "CI review current diff",
      changedFiles: [
        ...changed.modified,
        ...changed.deleted,
        ...changed.untracked,
      ],
      diff,
      testResults: [],
    });
    const markdown = [
      "# CI Review",
      "",
      `Passed: ${String(review.passed)}`,
      "",
      "## Issues",
      "",
      ...(review.issues.length > 0
        ? review.issues.map((issue) => `- [${issue.severity}] ${issue.message}`)
        : ["- No issues found."]),
    ].join("\n");
    if (outputPath) {
      writeFileSync(outputPath, markdown, "utf8");
    }
    return markdown;
  }
}
