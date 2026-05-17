import { resolve } from "node:path";

export function resolveWorkspace(cwd: string): string {
  return resolve(cwd);
}
