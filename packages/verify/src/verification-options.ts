import type { VerifyProfileCommands, VerifyProfileConfig } from "./verify-profile.js";
import { DEFAULT_VERIFY_TIMEOUT_MS } from "./verify-profile.js";

export interface VerificationOptions {
  test?: boolean;
  lint?: boolean;
  build?: boolean;
  typecheck?: boolean;
  timeoutMs?: number;
  cwd?: string;
  commands?: VerifyProfileCommands;
}

/** Default verification profile for edit/agent automatic verification after patch. */
export const EDIT_AGENT_VERIFY_OPTIONS: VerificationOptions = {
  test: true,
  lint: false,
  build: true,
  typecheck: true,
};

export function resolveVerificationOptions(
  profile?: VerifyProfileConfig,
  fallback: VerificationOptions = EDIT_AGENT_VERIFY_OPTIONS,
): VerificationOptions {
  if (!profile?.enable) {
    return {
      ...fallback,
      ...(profile?.timeoutMs === undefined ? {} : { timeoutMs: profile.timeoutMs }),
      ...(profile?.cwd === undefined ? {} : { cwd: profile.cwd }),
      ...(profile?.commands === undefined ? {} : { commands: profile.commands }),
    };
  }
  return {
    test: profile.enable.test ?? fallback.test ?? true,
    lint: profile.enable.lint ?? fallback.lint ?? true,
    build: profile.enable.build ?? fallback.build ?? true,
    typecheck: profile.enable.typecheck ?? fallback.typecheck ?? true,
    ...(profile.timeoutMs ?? fallback.timeoutMs
      ? { timeoutMs: profile.timeoutMs ?? fallback.timeoutMs }
      : {}),
    ...(profile.cwd ?? fallback.cwd ? { cwd: profile.cwd ?? fallback.cwd } : {}),
    ...(profile.commands ?? fallback.commands
      ? { commands: { ...fallback.commands, ...profile.commands } }
      : {}),
  };
}

export function resolveVerificationTimeoutMs(
  options: VerificationOptions,
  profile?: VerifyProfileConfig,
): number {
  return options.timeoutMs ?? profile?.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
}
