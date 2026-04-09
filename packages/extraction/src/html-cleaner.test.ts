import { describe, it, expect } from "vitest";
import { cleanHtml, extractStructuredText } from "./html-cleaner.js";

const sampleHtml = `
<html>
<head>
  <script>var x = 1;</script>
  <style>body { color: red; }</style>
</head>
<body>
  <nav>Navigation menu</nav>
  <header>Site header</header>
  <main>
    <h1>Beautiful Apartment in Playa del Carmen</h1>
    <p>This stunning 3-bedroom apartment offers ocean views and modern finishes.</p>
    <ul>
      <li>3 bedrooms</li>
      <li>2 bathrooms</li>
      <li>120 m2</li>
    </ul>
    <p>Price: $5,500,000 MXN</p>
  </main>
  <footer>Copyright 2026</footer>
</body>
</html>
`;

describe("cleanHtml", () => {
  it("removes scripts, styles, nav, header, footer", () => {
    const text = cleanHtml(sampleHtml);
    expect(text).not.toContain("var x = 1");
    expect(text).not.toContain("color: red");
    expect(text).not.toContain("Navigation menu");
    expect(text).not.toContain("Site header");
    expect(text).not.toContain("Copyright 2026");
  });

  it("preserves listing content", () => {
    const text = cleanHtml(sampleHtml);
    expect(text).toContain("Beautiful Apartment");
    expect(text).toContain("3-bedroom");
    expect(text).toContain("5,500,000");
  });

  it("collapses whitespace", () => {
    const text = cleanHtml(sampleHtml);
    expect(text).not.toContain("\n\n");
  });
});

describe("extractStructuredText", () => {
  it("extracts headings with ## prefix", () => {
    const text = extractStructuredText(sampleHtml);
    expect(text).toContain("## Beautiful Apartment");
  });

  it("extracts list items with - prefix", () => {
    const text = extractStructuredText(sampleHtml);
    expect(text).toContain("- 3 bedrooms");
    expect(text).toContain("- 2 bathrooms");
  });

  it("extracts paragraphs", () => {
    const text = extractStructuredText(sampleHtml);
    expect(text).toContain("stunning 3-bedroom");
  });
});
