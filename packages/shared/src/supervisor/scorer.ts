import type {
  QaStatus,
  SupervisorIssue,
  SupervisorJudgeOutput,
  SupervisorReport,
} from "../schemas/supervisor.js";
import { SUPERVISOR_CHECK_VERSION } from "../schemas/supervisor.js";
import { RUBRIC_WEIGHTS } from "./rubric.js";

export interface ScorerInputs {
  propertyId: string;
  factualIssues: SupervisorIssue[];
  contentIssues: SupervisorIssue[];
  judge: SupervisorJudgeOutput | null;
  judgeCostUsd?: number;
}

/** Combine deterministic rule output + optional LLM judge output into a
 * final SupervisorReport. */
export function buildReport(inputs: ScorerInputs): SupervisorReport {
  const {
    propertyId,
    factualIssues,
    contentIssues,
    judge,
    judgeCostUsd,
  } = inputs;

  const factualScore = computeFactualScore(factualIssues, judge);
  const contentScore = computeContentScore(contentIssues, judge);
  const supervisorScore = computeSupervisorScore({
    factualScore,
    contentScore,
    judge,
  });

  const allIssues: SupervisorIssue[] = [
    ...factualIssues,
    ...contentIssues,
    ...(judge?.issues ?? []),
  ];

  const qaStatus = computeQaStatus(allIssues, supervisorScore);

  const report: SupervisorReport = {
    propertyId,
    version: SUPERVISOR_CHECK_VERSION,
    checkedAt: new Date().toISOString(),
    factualScore,
    contentScore,
    supervisorScore,
    qaStatus,
    issues: allIssues,
  };
  if (judge?.summary) report.summary = judge.summary;
  if (judgeCostUsd !== undefined) report.judgeCostUsd = judgeCostUsd;
  return report;
}

function computeFactualScore(
  issues: SupervisorIssue[],
  judge: SupervisorJudgeOutput | null,
): number {
  let base = 100;
  for (const issue of issues) {
    if (issue.severity === "error") base -= 25;
    else if (issue.severity === "warning") base -= 10;
    else base -= 3;
  }
  if (judge) {
    base = Math.min(base, judge.factualScore);
  }
  return Math.max(0, Math.min(100, Math.round(base)));
}

function computeContentScore(
  issues: SupervisorIssue[],
  judge: SupervisorJudgeOutput | null,
): number {
  let base = 100;
  for (const issue of issues) {
    if (issue.severity === "error") base -= 20;
    else if (issue.severity === "warning") base -= 8;
    else base -= 2;
  }
  if (judge) {
    // Judge scores carry weight per rubric dimension
    const weighted =
      judge.contentScore * (RUBRIC_WEIGHTS["contentScore"] ?? 0) +
      judge.adherenceManual * (RUBRIC_WEIGHTS["adherenceManual"] ?? 0) +
      judge.specificity * (RUBRIC_WEIGHTS["specificity"] ?? 0) +
      judge.leadConversionPotential *
        (RUBRIC_WEIGHTS["leadConversionPotential"] ?? 0);
    // Normalise weights (they sum to 1.0 for content-side dimensions)
    const totalWeight =
      (RUBRIC_WEIGHTS["contentScore"] ?? 0) +
      (RUBRIC_WEIGHTS["adherenceManual"] ?? 0) +
      (RUBRIC_WEIGHTS["specificity"] ?? 0) +
      (RUBRIC_WEIGHTS["leadConversionPotential"] ?? 0);
    const judgeBlended = totalWeight > 0 ? weighted / totalWeight : 100;
    // Final content score: 60% deterministic, 40% judge
    base = base * 0.6 + judgeBlended * 0.4;
  }
  return Math.max(0, Math.min(100, Math.round(base)));
}

function computeSupervisorScore(params: {
  factualScore: number;
  contentScore: number;
  judge: SupervisorJudgeOutput | null;
}): number {
  // Factual weight: 50%, content weight: 50%. A listing can have a
  // perfect description but if facts are wrong, it should not publish.
  const combined = params.factualScore * 0.5 + params.contentScore * 0.5;
  return Math.max(0, Math.min(100, Math.round(combined)));
}

function computeQaStatus(
  issues: SupervisorIssue[],
  supervisorScore: number,
): QaStatus {
  const hasError = issues.some((i) => i.severity === "error");
  const factualError = issues.some(
    (i) => i.category === "factual" && i.severity === "error",
  );

  if (factualError || supervisorScore < 40) return "blocked";
  if (hasError || supervisorScore < 70) return "needs_review";
  return "ok";
}

/** Decide whether the LLM judge should run.
 *
 * Gate: if deterministic rules already flagged factual errors, skip the
 * judge — the listing needs human review regardless. Run the judge when
 * deterministic scores are clean enough that the nuanced evaluation
 * matters (and when the user forces a re-run). */
export function shouldRunJudge(params: {
  factualIssues: SupervisorIssue[];
  contentIssues: SupervisorIssue[];
  force: boolean;
}): boolean {
  if (params.force) return true;
  const hasFactualError = params.factualIssues.some(
    (i) => i.severity === "error",
  );
  if (hasFactualError) return false;
  const contentErrorCount = params.contentIssues.filter(
    (i) => i.severity === "error",
  ).length;
  // If > 2 content errors, judge cost is wasted — rewrite first
  if (contentErrorCount > 2) return false;
  return true;
}
