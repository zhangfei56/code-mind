export interface PlanApprovalRequest {
  planSessionId: string;
  planText: string;
}

export type PlanApprovalHandler = (
  request: PlanApprovalRequest,
) => Promise<boolean>;
