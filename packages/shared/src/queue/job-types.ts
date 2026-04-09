/** Job data types for each pipeline stage.
 *
 * Every job carries sourceId + crawlRunId for P6 observability.
 */

export interface CrawlJobData {
  sourceId: string;
  crawlRunId: string;
  domain: string;
  maxPages?: number | undefined;
  startUrl?: string | undefined;
}

export interface ExtractJobData {
  sourceId: string;
  crawlRunId: string;
  pageUrl: string;
  html: string;
}

export interface ImageProcessingJobData {
  sourceId: string;
  crawlRunId: string;
  propertyId: string;
  imageUrl: string;
  position: number;
}

export interface ParaphraseJobData {
  sourceId: string;
  crawlRunId: string;
  propertyId: string;
  description: string;
}

export interface TranslateJobData {
  sourceId: string;
  crawlRunId: string;
  propertyId: string;
  textEs: string;
  targetLocale: "en" | "fr";
}

export interface PublishJobData {
  sourceId: string;
  crawlRunId: string;
  propertyId: string;
}

export type JobDataMap = {
  crawl: CrawlJobData;
  extract: ExtractJobData;
  "image-processing": ImageProcessingJobData;
  paraphrase: ParaphraseJobData;
  translate: TranslateJobData;
  publish: PublishJobData;
};
