import { isSensitivePath } from "../workspace/sandbox-path.js";

export function canReadFile(path: string): boolean {
  return !isSensitivePath(path);
}
