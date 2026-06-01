import type { ToolCall } from "@code-mind/shared";
import type { ExplorationEvidence } from "../task-strategy.js";

/** Repo entry / orientation files (README, package manifests, etc.). */
export const REPO_ENTRY_FILE_PATTERN =
  /(^|\/)(readme|agents|package\.json|pyproject\.toml|cargo\.toml|go\.mod|tsconfig\.json)$/i;

/** Files that typically declare how to verify the project. */
export const VERIFICATION_MANIFEST_PATTERN =
  /(package\.json|pyproject\.toml|cargo\.toml|go\.mod)/i;

/** Paths that likely contain implementation or test code worth inspecting. */
export const CANDIDATE_SOURCE_PATH_PATTERN =
  /^(src|lib|apps|packages)\/|\/(test|tests|spec|__tests__)\/|(^|\/)__tests__\//i;

export function markProjectRootConfirmed(evidence: ExplorationEvidence): void {
  evidence.projectRootConfirmed = true;
}

export function markEntryFileRead(evidence: ExplorationEvidence): void {
  evidence.entryFileRead = true;
}

export function markCandidateFileLocated(evidence: ExplorationEvidence): void {
  evidence.candidateFileLocated = true;
}

export function markVerificationCommandKnown(evidence: ExplorationEvidence): void {
  evidence.verificationCommandKnown = true;
}

function readToolPath(toolCall: ToolCall): string | undefined {
  return typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : undefined;
}

function applyReadFileEvidence(evidence: ExplorationEvidence, path: string): void {
  if (REPO_ENTRY_FILE_PATTERN.test(path)) {
    markEntryFileRead(evidence);
  }
  if (CANDIDATE_SOURCE_PATH_PATTERN.test(path)) {
    markCandidateFileLocated(evidence);
  }
  if (VERIFICATION_MANIFEST_PATTERN.test(path)) {
    markVerificationCommandKnown(evidence);
  }
}

export function updateExplorationEvidence(
  evidence: ExplorationEvidence,
  toolCall: ToolCall,
  result: { success: boolean; output: string; metadata?: Record<string, unknown> },
): void {
  if (!result.success) {
    return;
  }

  if (toolCall.name === "list_dir") {
    markProjectRootConfirmed(evidence);
    return;
  }

  if (toolCall.name === "read_file") {
    const path = readToolPath(toolCall);
    if (path) {
      applyReadFileEvidence(evidence, path);
    }
    return;
  }

  if (toolCall.name === "grep" || toolCall.name === "glob") {
    markCandidateFileLocated(evidence);
  }

  if (
    toolCall.name === "lsp_symbols" ||
    toolCall.name === "lsp_definition" ||
    toolCall.name === "lsp_references"
  ) {
    const path = readToolPath(toolCall);
    if (path) {
      applyReadFileEvidence(evidence, path);
    } else {
      markCandidateFileLocated(evidence);
    }
  }

  if (toolCall.name === "run_shell") {
    const command =
      typeof toolCall.arguments.command === "string" ? toolCall.arguments.command : "";
    if (VERIFY_SHELL_COMMAND_PATTERN.test(command)) {
      markVerificationCommandKnown(evidence);
    }
    if (/\.(ts|js|py|go|rs)\b/i.test(command) || /src\/|test/i.test(command)) {
      markCandidateFileLocated(evidence);
    }
  }
}

const VERIFY_SHELL_COMMAND_PATTERN =
  /\b(npm test|pnpm test|yarn test|node test|node \S+\.js|pytest|cargo test|go test|vitest|jest)\b/i;
