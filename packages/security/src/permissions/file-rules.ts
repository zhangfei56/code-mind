import { isSensitivePath } from "@code-mind/workspace";

export function canReadFile(path: string): boolean {
  return !isSensitivePath(path);
}
