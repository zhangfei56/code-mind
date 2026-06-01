import { runRuntimeGapFixTests } from "./unit/runtime-gap-fix.test.js";
import { runRunKernelTests } from "./unit/run-kernel.test.js";
import { runRuntimePortsTests } from "./unit/runtime-ports.test.js";
import { runKernelObservabilityTests, runCoreStabilityAuditTests } from "./unit/kernel-observability.test.js";
import { runCapabilitySelectorTests } from "./unit/capability-selector.test.js";
import { runSkillModeTests } from "./unit/skill-mode.test.js";
import { runSkillPolicyTests } from "./unit/skill-policy.test.js";
import { runSkillRecallTests } from "./unit/skill-recall.test.js";
import { runReadSkillToolTests } from "./unit/read-skill-tool.test.js";
import { runAgentModeBenchmarkTests } from "./unit/agent-mode-benchmark.test.js";
import { runBenchmarkGraderTests } from "./unit/benchmark-graders.test.js";
import { runBenchmarkWorkloadTests } from "./unit/benchmark-workload.test.js";
import { runSwebenchWorkspaceTests } from "./unit/swebench-workspace.test.js";
import { runVerifyOnlyAutomaticVerificationTests } from "./unit/verify-only-automatic.test.js";
import { runApiRunTests } from "./unit/api-run.test.js";
import { runAsyncRunManagerTests } from "./unit/async-run-manager.test.js";
import { runHttpPlanApprovalQueueTests, runApiPlanApprovalRouteTests, runWebSocketStreamTests } from "./unit/api-plan-approval.test.js";
import { runPlanSessionTests } from "./unit/plan-session.test.js";
import { runPlanModeProtocolTests } from "./unit/plan-mode-protocol.test.js";
import { runTypedSubagentTests } from "./unit/typed-subagent.test.js";
import { runSubagentPermissionTests } from "./unit/subagent-permission.test.js";
import { runSubagentIntegrationTests } from "./unit/subagent-integration.test.js";
import { runToolIntentTests } from "./unit/tool-intent.test.js";
import { runApiApprovalTests } from "./unit/api-approval.test.js";
import { runRunSessionTests } from "./unit/run-session.test.js";
import { runAgentModeFinalizeTests } from "./unit/agent-mode-finalize.test.js";
import { runAgentModePermissionTests } from "./unit/agent-mode-permission.test.js";
import { runAgentModeRegistryTests } from "./unit/agent-mode-registry.test.js";
import { runAgentModeRuntimeTests } from "./unit/agent-mode-runtime.test.js";
import { runNoKeywordClassificationTests } from "./regression/no-keyword-classification.test.js";
import { runConfigShowTests } from "./unit/config-show.test.js";
import { runConfigTests } from "./unit/config.test.js";
import { runModelPromptTests } from "./unit/model-prompt.test.js";
import { runProductPromptTests } from "./unit/product-prompt.test.js";
import { runContextSnapshotTests } from "./unit/context-snapshot.test.js";
import { runRunFactsTests } from "./unit/run-facts.test.js";
import { runContextManagerTests } from "./unit/context.test.js";
import { runCompactionTests } from "./unit/compaction.test.js";
import { runCompactionLifecycleTests } from "./unit/compaction-lifecycle.test.js";
import { runCompactionEvalTests } from "./unit/compaction-eval.test.js";
import { runCompactionConfigTests } from "./unit/compaction-config.test.js";
import { runHighRiskToolTests } from "./unit/high-risk-tools.test.js";
import { runInteractiveTests } from "./unit/interactive.test.js";
import { runApprovalCoordinatorTests } from "./unit/approval-coordinator.test.js";
import { runApprovalPromptTests } from "./unit/approval-prompt.test.js";
import { runAgentCompositionTests } from "./unit/agent-composition.test.js";
import { runCoreGapsTests } from "./unit/core-gaps.test.js";
import { runModelTests } from "./unit/model.test.js";
import { runObservabilityTests } from "./unit/observability.test.js";
import { runObservabilityEventTests } from "./unit/observability-events.test.js";
import { runLoggerTests } from "./unit/logger.test.js";
import { runCommonOptionsTests } from "./unit/common-options.test.js";
import { runParseArgsTests } from "./unit/parse-args.test.js";
import { runNormalizeArgvTests } from "./unit/normalize-argv.test.js";
import { runRenderTests } from "./unit/render.test.js";
import { runFinalTextTests } from "./unit/final-text.test.js";
import { runTextWrapTests } from "./unit/text-wrap.test.js";
import { runDisplayTests } from "./unit/display.test.js";
import { runPlanFormatTests } from "./unit/plan-format.test.js";
import { runMockCliTests } from "./unit/mock-cli.test.js";
import { runPhase3AdvancedTests } from "./unit/phase3-advanced.test.js";
import { runPhase3FoundationTests } from "./unit/phase3-foundation.test.js";
import { runPhase4EngineeringTests } from "./unit/phase4-engineering.test.js";
import { runPhase5PlatformTests } from "./unit/phase5-platform.test.js";
import { runPermissionEngineTests } from "./unit/permission-engine.test.js";
import { runRuntimeTests } from "./unit/runtime.test.js";
import { runRuntimeStabilityTests } from "./unit/runtime-stability.test.js";
import { runToolCallApprovalTests, runHookAskApprovalTests, runHookDenyApprovalTests } from "./unit/tool-call-approval.test.js";
import { runRestoreMessagesTests } from "./unit/restore-messages.test.js";
import { runExplorationEvidenceTests } from "./unit/exploration-evidence.test.js";
import { runRecoveryLoopTests } from "./unit/recovery-loop.test.js";
import { runRecoveryResumeHardeningTests } from "./unit/recovery-resume-hardening.test.js";
import { runVerificationEventsTests, runAgentLoopIntegrationTests } from "./integration/agent-loop.test.js";
import { runSessionRollbackTests } from "./unit/session-rollback.test.js";
import { runResumeWorktreeTests } from "./unit/resume-worktree.test.js";
import { runResumeTests } from "./unit/resume.test.js";
import { runSessionStoreTests } from "./unit/session-store.test.js";
import { runSessionCliTests } from "./unit/sessions.test.js";
import { runTaskStrategyTests } from "./unit/task-strategy.test.js";
import { runTaskClarityTests } from "./unit/task-clarity.test.js";
import { runTaskClarityResolutionTests } from "./unit/task-clarity-resolution.test.js";
import { runLspToolsTests } from "./unit/lsp-tools.test.js";
import { runAccuracyScopeTests } from "./unit/accuracy-scope.test.js";
import { runToolTests } from "./unit/tools.test.js";
import { runTypeContractTests } from "./unit/types.test.js";
import { runWorkspaceTests } from "./unit/workspace.test.js";
import { runMemoryProviderTests } from "./unit/memory.test.js";
import { runSharedFoundationTests } from "./unit/shared-foundation.test.js";
import { runTokenUsageTests } from "./unit/token-usage.test.js";
import { runMetricsSinkTests } from "./unit/metrics-sink.test.js";
import { runSystemPromptTests } from "./unit/system-prompt.test.js";
import { runCoreResultStatusTests } from "./unit/core-result-status.test.js";
import { runVerifyPipelineTests } from "./unit/verify-pipeline.test.js";
import { runPackageExportsTests } from "./unit/package-exports.test.js";

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

const tests: TestCase[] = [
  { name: "package exports", run: runPackageExportsTests },
  { name: "shared foundation", run: runSharedFoundationTests },
  { name: "token usage", run: runTokenUsageTests },
  { name: "metrics sink", run: runMetricsSinkTests },
  { name: "memory provider", run: runMemoryProviderTests },
  { name: "system prompt", run: runSystemPromptTests },
  { name: "core result status", run: runCoreResultStatusTests },
  { name: "verify pipeline", run: runVerifyPipelineTests },
  { name: "observability events", run: runObservabilityEventTests },
  { name: "parseArgs", run: runParseArgsTests },
  { name: "normalizeArgv", run: runNormalizeArgvTests },
  { name: "render", run: runRenderTests },
  { name: "final text", run: runFinalTextTests },
  { name: "text wrap", run: runTextWrapTests },
  { name: "display", run: runDisplayTests },
  { name: "plan format", run: runPlanFormatTests },
  { name: "mock cli", run: runMockCliTests },
  { name: "interactive", run: runInteractiveTests },
  { name: "approval coordinator", run: runApprovalCoordinatorTests },
  { name: "approval prompt", run: runApprovalPromptTests },
  { name: "agent composition", run: runAgentCompositionTests },
  { name: "core gaps", run: runCoreGapsTests },
  { name: "runtime gap fixes", run: runRuntimeGapFixTests },
  { name: "run kernel", run: runRunKernelTests },
  { name: "runtime ports", run: runRuntimePortsTests },
  { name: "capability selector", run: runCapabilitySelectorTests },
  { name: "kernel observability", run: runKernelObservabilityTests },
  { name: "core stability audit", run: runCoreStabilityAuditTests },
  { name: "config show", run: runConfigShowTests },
  { name: "config", run: runConfigTests },
  { name: "context manager", run: runContextManagerTests },
  { name: "compaction", run: runCompactionTests },
  { name: "compaction lifecycle", run: runCompactionLifecycleTests },
  { name: "compaction eval", run: runCompactionEvalTests },
  { name: "compaction config", run: runCompactionConfigTests },
  { name: "run facts", run: runRunFactsTests },
  { name: "context snapshot", run: runContextSnapshotTests },
  { name: "product prompts", run: runProductPromptTests },
  { name: "model prompt", run: runModelPromptTests },
  { name: "type contracts", run: runTypeContractTests },
  { name: "model", run: runModelTests },
  { name: "logger", run: runLoggerTests },
  { name: "common options", run: runCommonOptionsTests },
  { name: "observability", run: runObservabilityTests },
  { name: "workspace helpers", run: runWorkspaceTests },
  { name: "permission engine", run: runPermissionEngineTests },
  { name: "phase3 foundation", run: runPhase3FoundationTests },
  { name: "phase3 advanced", run: runPhase3AdvancedTests },
  { name: "phase4 engineering", run: runPhase4EngineeringTests },
  { name: "phase5 platform", run: runPhase5PlatformTests },
  { name: "session store", run: runSessionStoreTests },
  { name: "session cli", run: runSessionCliTests },
  { name: "task strategy", run: runTaskStrategyTests },
  { name: "task clarity", run: runTaskClarityTests },
  { name: "task clarity resolution", run: runTaskClarityResolutionTests },
  { name: "lsp tools", run: runLspToolsTests },
  { name: "accuracy scope", run: runAccuracyScopeTests },
  { name: "agent mode registry", run: runAgentModeRegistryTests },
  { name: "agent mode permission", run: runAgentModePermissionTests },
  { name: "agent mode finalize", run: runAgentModeFinalizeTests },
  { name: "skill mode", run: runSkillModeTests },
  { name: "skill policy", run: runSkillPolicyTests },
  { name: "skill recall", run: runSkillRecallTests },
  { name: "read skill tool", run: runReadSkillToolTests },
  { name: "run session", run: runRunSessionTests },
  { name: "plan session", run: runPlanSessionTests },
  { name: "plan mode protocol", run: runPlanModeProtocolTests },
  { name: "typed subagents", run: runTypedSubagentTests },
  { name: "subagent permission", run: runSubagentPermissionTests },
  { name: "subagent integration", run: runSubagentIntegrationTests },
  { name: "tool intent", run: runToolIntentTests },
  { name: "api run", run: runApiRunTests },
  { name: "async run manager", run: runAsyncRunManagerTests },
  { name: "http plan approval queue", run: runHttpPlanApprovalQueueTests },
  { name: "api plan approval routes", run: runApiPlanApprovalRouteTests },
  { name: "websocket stream", run: runWebSocketStreamTests },
  { name: "api approval", run: runApiApprovalTests },
  { name: "agent mode benchmark", run: runAgentModeBenchmarkTests },
  { name: "benchmark graders", run: runBenchmarkGraderTests },
  { name: "benchmark workload loaders", run: runBenchmarkWorkloadTests },
  { name: "swebench workspace", run: runSwebenchWorkspaceTests },
  { name: "verify-only automatic verification", run: runVerifyOnlyAutomaticVerificationTests },
  { name: "agent mode runtime", run: runAgentModeRuntimeTests },
  { name: "no keyword classification", run: runNoKeywordClassificationTests },
  { name: "tools", run: runToolTests },
  { name: "high risk tools", run: runHighRiskToolTests },
  { name: "runtime", run: runRuntimeTests },
  { name: "runtime stability", run: runRuntimeStabilityTests },
  { name: "exploration evidence", run: runExplorationEvidenceTests },
  { name: "recovery loop", run: runRecoveryLoopTests },
  { name: "recovery resume hardening", run: runRecoveryResumeHardeningTests },
  { name: "tool call approval", run: runToolCallApprovalTests },
  { name: "hook ask approval", run: runHookAskApprovalTests },
  { name: "hook deny approval", run: runHookDenyApprovalTests },
  { name: "restore messages", run: runRestoreMessagesTests },
  { name: "verification events", run: runVerificationEventsTests },
  { name: "agent loop integration", run: runAgentLoopIntegrationTests },
  { name: "session rollback", run: runSessionRollbackTests },
  { name: "resume worktree", run: runResumeWorktreeTests },
  { name: "resume", run: runResumeTests },
];

async function main(): Promise<void> {
  const failures: Array<{ name: string; error: unknown }> = [];

  for (const test of tests) {
    try {
      await test.run();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failures.push({ name: test.name, error });
      console.error(`FAIL ${test.name}`);
      console.error(error);
    }
  }

  console.log("");
  console.log(`Results: ${tests.length - failures.length}/${tests.length} passed`);

  if (failures.length > 0) {
    console.error("");
    console.error("Failed suites:");
    for (const failure of failures) {
      console.error(`  - ${failure.name}`);
    }
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("Test runner failed.");
  console.error(error);
  process.exit(1);
});
