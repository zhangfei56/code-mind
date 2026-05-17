import { runConfigTests } from "./unit/config.test.js";
import { runHighRiskToolTests } from "./unit/high-risk-tools.test.js";
import { runModelTests } from "./unit/model.test.js";
import { runParseArgsTests } from "./unit/parse-args.test.js";
import { runPermissionEngineTests } from "./unit/permission-engine.test.js";
import { runRuntimeTests } from "./unit/runtime.test.js";
import { runSessionStoreTests } from "./unit/session-store.test.js";
import { runToolTests } from "./unit/tools.test.js";
import { runTypeContractTests } from "./unit/types.test.js";
import { runWorkspaceTests } from "./unit/workspace.test.js";

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

const tests: TestCase[] = [
  { name: "parseArgs", run: runParseArgsTests },
  { name: "config", run: runConfigTests },
  { name: "type contracts", run: runTypeContractTests },
  { name: "model", run: runModelTests },
  { name: "workspace helpers", run: runWorkspaceTests },
  { name: "permission engine", run: runPermissionEngineTests },
  { name: "session store", run: runSessionStoreTests },
  { name: "tools", run: runToolTests },
  { name: "high risk tools", run: runHighRiskToolTests },
  { name: "runtime", run: runRuntimeTests },
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
