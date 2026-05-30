import type { Tool } from "@code-mind/shared";
import { PLAN_TOOLS_MODES, WRITE_TOOLS_MODES } from "@code-mind/shared";

export const enterPlanModeTool: Tool = {
  name: "enter_plan_mode",
  description:
    "Enter read-only plan mode. Explore the codebase, write a plan to the session plan-draft file, then call exit_plan_mode for user approval before editing source files.",
  riskLevel: "low",
  availableInModes: WRITE_TOOLS_MODES,
  schema: {
    name: "enter_plan_mode",
    description:
      "Enter read-only plan mode before making source changes. Use when the task is complex or high-risk.",
    inputSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why plan mode is needed for this task.",
        },
      },
    },
  },
  async execute() {
    return {
      success: false,
      output: "",
      error: "enter_plan_mode is handled by the runtime plan-mode controller.",
    };
  },
};

export const exitPlanModeTool: Tool = {
  name: "exit_plan_mode",
  description:
    "Submit the plan for user approval and exit plan mode. After approval, continue implementation in the prior collaboration mode.",
  riskLevel: "medium",
  availableInModes: PLAN_TOOLS_MODES,
  schema: {
    name: "exit_plan_mode",
    description: "Submit the final plan text for approval and restore write permissions.",
    inputSchema: {
      type: "object",
      properties: {
        planText: {
          type: "string",
          description: "Final plan markdown to submit for approval.",
        },
      },
      required: ["planText"],
    },
  },
  async execute() {
    return {
      success: false,
      output: "",
      error: "exit_plan_mode is handled by the runtime plan-mode controller.",
    };
  },
};

export function registerPlanModeTools(registry: { register(tool: Tool): void }): void {
  registry.register(enterPlanModeTool);
  registry.register(exitPlanModeTool);
}
