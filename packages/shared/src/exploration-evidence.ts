/** Exploration signals gathered from read/list/grep tool calls during a run. */
export interface ExplorationEvidence {
  projectRootConfirmed: boolean;
  entryFileRead: boolean;
  verificationCommandKnown: boolean;
  candidateFileLocated: boolean;
}

export function createEmptyExplorationEvidence(): ExplorationEvidence {
  return {
    projectRootConfirmed: false,
    entryFileRead: false,
    verificationCommandKnown: false,
    candidateFileLocated: false,
  };
}
