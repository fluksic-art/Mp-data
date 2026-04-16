/** Queue names for the processing pipeline.
 *
 * Pipeline order:
 * CRAWL → EXTRACT → IMAGE_PROCESSING → PARAPHRASE → TRANSLATE → SUPERVISOR → PUBLISH
 */
export const QUEUE_NAMES = {
  CRAWL: "crawl",
  EXTRACT: "extract",
  IMAGE_PROCESSING: "image-processing",
  PARAPHRASE: "paraphrase",
  TRANSLATE: "translate",
  SUPERVISOR: "supervisor",
  PUBLISH: "publish",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
