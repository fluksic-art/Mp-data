import { describe, it, expect } from "vitest";
import { QUEUE_NAMES } from "./queues.js";
import type { CrawlJobData, ExtractJobData, JobDataMap } from "./job-types.js";

describe("QUEUE_NAMES", () => {
  it("defines all pipeline stages", () => {
    expect(QUEUE_NAMES.CRAWL).toBe("crawl");
    expect(QUEUE_NAMES.EXTRACT).toBe("extract");
    expect(QUEUE_NAMES.IMAGE_PROCESSING).toBe("image-processing");
    expect(QUEUE_NAMES.PARAPHRASE).toBe("paraphrase");
    expect(QUEUE_NAMES.TRANSLATE).toBe("translate");
    expect(QUEUE_NAMES.SUPERVISOR).toBe("supervisor");
    expect(QUEUE_NAMES.PUBLISH).toBe("publish");
  });

  it("has 7 pipeline stages", () => {
    expect(Object.keys(QUEUE_NAMES)).toHaveLength(7);
  });
});

describe("job data types", () => {
  it("CrawlJobData has required P6 fields", () => {
    const job: CrawlJobData = {
      sourceId: "abc",
      crawlRunId: "def",
      domain: "example.com",
    };
    expect(job.sourceId).toBeDefined();
    expect(job.crawlRunId).toBeDefined();
  });

  it("ExtractJobData has required P6 fields", () => {
    const job: ExtractJobData = {
      sourceId: "abc",
      crawlRunId: "def",
      pageUrl: "https://example.com/listing/1",
      html: "<html></html>",
    };
    expect(job.sourceId).toBeDefined();
    expect(job.crawlRunId).toBeDefined();
  });

  it("JobDataMap maps queue names to correct types", () => {
    // Type-level check: this compiles only if the mapping is correct
    const _crawlData: JobDataMap["crawl"] = {
      sourceId: "a",
      crawlRunId: "b",
      domain: "example.com",
    };
    const _extractData: JobDataMap["extract"] = {
      sourceId: "a",
      crawlRunId: "b",
      pageUrl: "https://example.com",
      html: "",
    };
    expect(_crawlData.domain).toBe("example.com");
    expect(_extractData.pageUrl).toBe("https://example.com");
  });
});
