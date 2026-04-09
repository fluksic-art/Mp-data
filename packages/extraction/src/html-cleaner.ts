import * as cheerio from "cheerio";

/** P5: Clean HTML before sending to LLM.
 *
 * Strip nav, footer, ads, scripts, styles — send only listing content.
 * Reduces tokens 10-30x vs raw HTML.
 */
export function cleanHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $(
    "script, style, noscript, iframe, svg, link, meta, " +
      "nav, header, footer, " +
      "form, button, input, select, textarea, " +
      ".cookie-banner, .popup, .modal, .sidebar, .widget, " +
      "#cookie-consent, #popup, #modal, " +
      '[role="navigation"], [role="banner"], [role="contentinfo"]',
  ).remove();

  // Remove comments
  $("*")
    .contents()
    .each(function () {
      if (this.type === "comment") {
        $(this).remove();
      }
    });

  // Get text content with minimal structure
  const text = $("body").text().replace(/\s+/g, " ").trim();

  return text;
}

/** Extract visible text content preserving some structure */
export function extractStructuredText(html: string): string {
  const $ = cheerio.load(html);

  // Remove non-content
  $(
    "script, style, noscript, iframe, svg, link, meta, " +
      "nav, header, footer, form",
  ).remove();

  const lines: string[] = [];

  // Extract headings
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text) lines.push(`## ${text}`);
  });

  // Extract paragraphs
  $("p").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10) lines.push(text);
  });

  // Extract list items
  $("li").each((_, el) => {
    const text = $(el).text().trim();
    if (text) lines.push(`- ${text}`);
  });

  return lines.join("\n");
}
