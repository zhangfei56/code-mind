import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readSkillTool } from "../../packages/execution/src/tools/read-skill.js";

export async function runReadSkillToolTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-read-skill-"));
  const skillDir = join(workspace, ".agent", "skills", "demo");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "# Demo\n\nDo the thing.", "utf8");

  const ok = await readSkillTool.execute({ name: "demo" }, { workspaceRoot: workspace } as never);
  assert.equal(ok.success, true);
  assert.match(String(ok.output), /Do the thing/);

  const denied = await readSkillTool.execute(
    { name: "../escape", file: "SKILL.md" },
    { workspaceRoot: workspace } as never,
  );
  assert.equal(denied.success, false);
}
