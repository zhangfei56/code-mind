import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectRules {
  source: string | null;
  content: string | null;
}

const PROJECT_RULE_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

export function findProjectRules(workspaceRoot: string): ProjectRules {
  for (const fileName of PROJECT_RULE_FILES) {
    const filePath = join(workspaceRoot, fileName);
    if (existsSync(filePath)) {
      return {
        source: filePath,
        content: readFileSync(filePath, "utf8"),
      };
    }
  }

  return {
    source: null,
    content: null,
  };
}
