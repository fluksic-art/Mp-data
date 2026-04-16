import {
  buildReport,
  isStructuredContent,
  runContentRules,
  runFactualRules,
  shouldRunJudge,
  SUPERVISOR_CHECK_VERSION,
  createLogger,
  type PropertyForSupervisor,
  type SupervisorReport,
} from "@mpgenesis/shared";
import { judgeListing, loadManual } from "./judge.js";

const logger = createLogger("supervise");

export interface SuperviseInputs {
  property: PropertyForSupervisor;
  force: boolean;
  skipJudge: boolean;
  /** Raw status from DB — used by factual rules to decide if "draft" gates apply. */
  status: string;
}

export interface SuperviseResult {
  report: SupervisorReport;
  ranJudge: boolean;
  judgeCostUsd: number;
}

/** Run the full supervisor pipeline for a single property. Pure enough
 * to unit-test with mocked judge in the future. */
export async function superviseProperty(
  inputs: SuperviseInputs,
): Promise<SuperviseResult> {
  const { property, force, skipJudge, status } = inputs;

  const isDraft = status === "draft";
  const factualIssues = runFactualRules(property, { isDraft });
  const contentIssues = runContentRules(property);

  const contentEs = property.contentEs;
  const canJudge = !skipJudge && isStructuredContent(contentEs);
  const runJudge =
    canJudge &&
    shouldRunJudge({ factualIssues, contentIssues, force });

  let judgeOutput = null;
  let judgeCostUsd = 0;

  if (runJudge && contentEs) {
    try {
      const manualMarkdown = await loadManual();
      if (!manualMarkdown) {
        logger.warn(
          { propertyId: property.id },
          "Manual not found at docs/manual-descripciones.md — judge running with embedded rubric only",
        );
      }
      const judge = await judgeListing({
        property,
        content: contentEs,
        manualMarkdown,
      });
      judgeOutput = judge.output;
      judgeCostUsd = judge.usage.costUsd;
      logger.info(
        {
          propertyId: property.id,
          inputTokens: judge.usage.inputTokens,
          outputTokens: judge.usage.outputTokens,
          cacheReadTokens: judge.usage.cacheReadTokens,
          cacheWriteTokens: judge.usage.cacheWriteTokens,
          costUsd: judge.usage.costUsd.toFixed(5),
        },
        "Supervisor judge cost",
      );
    } catch (err) {
      logger.error(
        { propertyId: property.id, err },
        "Judge failed — report will reflect deterministic rules only",
      );
    }
  }

  const scorerInput: Parameters<typeof buildReport>[0] = {
    propertyId: property.id,
    factualIssues,
    contentIssues,
    judge: judgeOutput,
  };
  if (judgeCostUsd > 0) scorerInput.judgeCostUsd = judgeCostUsd;
  const report = buildReport(scorerInput);

  // Override the report version if we changed the checker logic
  report.version = SUPERVISOR_CHECK_VERSION;

  return {
    report,
    ranJudge: runJudge && judgeOutput !== null,
    judgeCostUsd,
  };
}
