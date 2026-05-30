import type { VerificationPipeline, VerificationOptions } from "@code-mind/verify";
import type { VerificationPort } from "../../kernel/ports.js";

export function createVerificationPort(
  verificationPipeline: VerificationPipeline,
): VerificationPort {
  return {
    run: (cwd, options: VerificationOptions = {}) => verificationPipeline.run(cwd, options),
  };
}
