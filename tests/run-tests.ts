import { runConfigShowTests } from "./unit/config-show.test.js";
import { runConfigTests } from "./unit/config.test.js";
import { runContextManagerTests } from "./unit/context.test.js";
import { runHighRiskToolTests } from "./unit/high-risk-tools.test.js";
import { runModelTests } from "./unit/model.test.js";
import { runParseArgsTests } from "./unit/parse-args.test.js";
import { runPhase3AdvancedTests } from "./unit/phase3-advanced.test.js";
import { runPhase3FoundationTests } from "./unit/phase3-foundation.test.js";
import { runPhase4EngineeringTests } from "./unit/phase4-engineering.test.js";
import { runPhase5PlatformTests } from "./unit/phase5-platform.test.js";
import { runPermissionEngineTests } from "./unit/permission-engine.test.js";
import { runRuntimeTests } from "./unit/runtime.test.js";
import { runResumeTests } from "./unit/resume.test.js";
import { runSessionStoreTests } from "./unit/session-store.test.js";
import { runSessionCliTests } from "./unit/sessions.test.js";
import { runToolTests } from "./unit/tools.test.js";
import { runTypeContractTests } from "./unit/types.test.js";
import { runWorkspaceTests } from "./unit/workspace.test.js";

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

const tests: TestCase[] = [
  { name: "parseArgs", run: runParseArgsTests },
  { name: "config show", run: runConfigShowTests },
  { name: "config", run: runConfigTests },
  { name: "context manager", run: runContextManagerTests },
  { name: "type contracts", run: runTypeContractTests },
  { name: "model", run: runModelTests },
  { name: "workspace helpers", run: runWorkspaceTests },
  { name: "permission engine", run: runPermissionEngineTests },
  { name: "phase3 foundation", run: runPhase3FoundationTests },
  { name: "phase3 advanced", run: runPhase3AdvancedTests },
  { name: "phase4 engineering", run: runPhase4EngineeringTests },
  { name: "phase5 platform", run: runPhase5PlatformTests },
  { name: "session store", run: runSessionStoreTests },
  { name: "session cli", run: runSessionCliTests },
  { name: "tools", run: runToolTests },
  { name: "high risk tools", run: runHighRiskToolTests },
  { name: "runtime", run: runRuntimeTests },
  { name: "resume", run: runResumeTests },
];

async function main(): Promise<void> {
  for (const test of tests) {
    await test.run();
    console.log(`PASS ${test.name}`);
  }
}

main().catch((error: unknown) => {
  console.error("Test run failed.");
  console.error(error);
  process.exit(1);
});
