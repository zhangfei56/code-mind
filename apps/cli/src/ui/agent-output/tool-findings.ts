import { shortPath } from "../theme.js";
import type { ToolFinishedLike } from "./tool-blocks.js";
import { toolPayloadToFinishedLike } from "./tool-blocks.js";

function toolArgs(toolCall: ToolFinishedLike["toolCall"]): Record<string, unknown> {
  return (toolCall.arguments ?? {}) as Record<string, unknown>;
}

function grepResultSummary(output?: string): string {
  if (!output?.trim()) {
    return "0 matches";
  }
  const lines = output.trim().split("\n").filter(Boolean);
  if (lines.length === 1) {
    return lines[0]!;
  }
  return `${lines.length} matches`;
}

function listDirEntries(output?: string): string[] {
  return (output ?? "")
    .split("\n")
    .map((line) => line.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function formatListDirDiscovery(event: ToolFinishedLike): string | null {
  const entries = listDirEntries(event.outputPreview);
  if (entries.length === 0) {
    return null;
  }

  const markers: Array<{ match: (entry: string) => boolean; label: string }> = [
    { match: (entry) => entry === "package.json", label: "package.json" },
    { match: (entry) => entry === "pyproject.toml", label: "pyproject.toml" },
    { match: (entry) => entry === "Cargo.toml", label: "Cargo.toml" },
    { match: (entry) => entry === "go.mod", label: "go.mod" },
    { match: (entry) => entry === "src" || entry.endsWith("/src"), label: "src/" },
    { match: (entry) => entry === "tests" || entry.endsWith("/tests"), label: "tests/" },
    { match: (entry) => entry === "apps" || entry.endsWith("/apps"), label: "apps/" },
    { match: (entry) => entry === "packages" || entry.endsWith("/packages"), label: "packages/" },
  ];

  const found = markers
    .filter((marker) => entries.some(marker.match))
    .map((marker) => marker.label);
  if (found.length > 0) {
    return `  ✓ Found ${found.join(", ")}`;
  }
  return null;
}

function formatReadDiscovery(event: ToolFinishedLike): string | null {
  const args = toolArgs(event.toolCall);
  const path = typeof args.path === "string" ? args.path : "";
  const base = path.split("/").pop() ?? path;

  if (/README/i.test(base)) {
    return `  ✓ Found project overview in ${shortPath(path)}`;
  }
  if (base === "package.json") {
    return "  ✓ Found package manifest";
  }
  if (base === "implementation.md") {
    return `  ✓ Read implementation status in ${shortPath(path)}`;
  }
  if (/^docs\//i.test(path)) {
    return `  ✓ Read project doc ${shortPath(path)}`;
  }
  if (base === "AGENTS.md") {
    return "  ✓ Found agent guidance";
  }
  if (/\.(test|spec)\./i.test(base) || /^(tests?|__tests__)$/i.test(base)) {
    return `  ✓ Found test-related file ${shortPath(path)}`;
  }
  return null;
}

function formatShellDiscovery(event: ToolFinishedLike): string | null {
  const output = event.outputPreview ?? "";
  const passed = output.match(/(\d+)\s+passed/i);
  if (passed?.[1]) {
    return `  ✓ ${passed[1]} tests passed`;
  }
  if (/FAIL|failed/i.test(output)) {
    return "  ! Tests reported failures";
  }
  if (/error TS\d+/i.test(output)) {
    return "  ! Typecheck reported errors";
  }
  return null;
}

function formatGrepDiscovery(event: ToolFinishedLike): string | null {
  const args = toolArgs(event.toolCall);
  const pattern = typeof args.pattern === "string" ? args.pattern : "";
  const output = event.outputPreview ?? "";
  const lines = output.split("\n").filter(Boolean);
  if (lines.length === 0) {
    return `  ! No matches for "${pattern}"`;
  }
  const files = new Set(
    lines
      .map((line) => line.split(":")[0])
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  if (files.size > 0) {
    return `  ✓ Found ${lines.length} match${lines.length === 1 ? "" : "es"} in ${files.size} file${files.size === 1 ? "" : "s"}`;
  }
  return null;
}

/** Compact semantic line shown under a step (L0/L1). */
export function formatToolFindingLine(payload: Record<string, unknown>): string | null {
  const event = toolPayloadToFinishedLike(payload);
  if (event === null) {
    return null;
  }
  const args = toolArgs(event.toolCall);
  const glyph = event.success ? "✓" : "×";

  if (event.success) {
    switch (event.toolCall.name) {
      case "list_dir": {
        return formatListDirDiscovery(event) ?? `  ${glyph} Listed ${shortPath(typeof args.path === "string" ? args.path : ".")}`;
      }
      case "read_file": {
        const path = typeof args.path === "string" ? args.path : "unknown";
        return formatReadDiscovery(event) ?? `  ${glyph} Read ${shortPath(path)}`;
      }
      case "grep":
        return formatGrepDiscovery(event) ?? `  ${glyph} Search "${typeof args.pattern === "string" ? args.pattern : ""}" — ${grepResultSummary(event.outputPreview)}`;
      case "run_shell": {
        const command = typeof args.command === "string" ? args.command : event.toolCall.name;
        return (
          formatShellDiscovery(event) ??
          `  ${glyph} Ran ${command.length > 48 ? `${command.slice(0, 45)}…` : command}`
        );
      }
      case "apply_patch": {
        const path =
          event.filePath ??
          (typeof args.patch === "string" ? "patched file" : "unknown file");
        return `  + Edit ${shortPath(String(path))}`;
      }
      default:
        return `  ${glyph} ${event.toolCall.name}`;
    }
  }

  switch (event.toolCall.name) {
    case "read_file": {
      const path = typeof args.path === "string" ? args.path : "unknown";
      return `  × File not found · ${shortPath(path)}`;
    }
    case "list_dir": {
      const path = typeof args.path === "string" ? args.path : ".";
      return `  × Listed ${shortPath(path)} · ${event.error ?? "failed"}`;
    }
    case "grep": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      return `  × Search failed · "${pattern}"`;
    }
    case "run_shell":
      return `  × Command failed · exit ${event.exitCode ?? "?"}`;
    case "apply_patch": {
      const path =
        event.filePath ??
        (typeof args.patch === "string" ? "patched file" : "unknown file");
      return `  × Patch failed · ${shortPath(String(path))}`;
    }
    default:
      return `  × ${event.toolCall.name} · ${event.error ?? "failed"}`;
  }
}
