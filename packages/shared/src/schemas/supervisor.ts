import { z } from "zod/v4";

/** Version tag for the supervisor check logic. Bump to invalidate all prior
 * runs and re-evaluate in the nightly cron. */
export const SUPERVISOR_CHECK_VERSION = "v1.0.0";

export const supervisorCategorySchema = z.enum(["factual", "content"]);
export type SupervisorCategory = z.infer<typeof supervisorCategorySchema>;

export const supervisorSeveritySchema = z.enum(["error", "warning", "info"]);
export type SupervisorSeverity = z.infer<typeof supervisorSeveritySchema>;

export const qaStatusSchema = z.enum(["ok", "needs_review", "blocked"]);
export type QaStatus = z.infer<typeof qaStatusSchema>;

export const supervisorIssueSchema = z.object({
  category: supervisorCategorySchema,
  rule: z.string(),
  severity: supervisorSeveritySchema,
  field: z.string().optional(),
  locale: z.enum(["es", "en", "fr"]).optional(),
  message: z.string(),
  evidence: z.unknown().optional(),
});
export type SupervisorIssue = z.infer<typeof supervisorIssueSchema>;

export const supervisorReportSchema = z.object({
  propertyId: z.string().uuid(),
  version: z.string(),
  checkedAt: z.string(),
  factualScore: z.number().int().min(0).max(100),
  contentScore: z.number().int().min(0).max(100),
  supervisorScore: z.number().int().min(0).max(100),
  qaStatus: qaStatusSchema,
  issues: z.array(supervisorIssueSchema),
  summary: z.string().optional(),
  judgeCostUsd: z.number().optional(),
});
export type SupervisorReport = z.infer<typeof supervisorReportSchema>;

/** Judge output — produced by the LLM-as-judge against the Propyte manual. */
export const supervisorJudgeOutputSchema = z.object({
  factualScore: z.number().int().min(0).max(100),
  contentScore: z.number().int().min(0).max(100),
  adherenceManual: z.number().int().min(0).max(100),
  specificity: z.number().int().min(0).max(100),
  leadConversionPotential: z.number().int().min(0).max(100),
  issues: z.array(supervisorIssueSchema),
  summary: z.string().max(400),
});
export type SupervisorJudgeOutput = z.infer<typeof supervisorJudgeOutputSchema>;

export function isSupervisorIssueArray(
  value: unknown,
): value is SupervisorIssue[] {
  return (
    Array.isArray(value) &&
    value.every((v) => supervisorIssueSchema.safeParse(v).success)
  );
}
