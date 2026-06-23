import { describe, expect, it } from "vitest";

import { cleanHtmlDocument, htmlToMarkdownDocument, htmlToVisibleText } from "./html-hygiene";

describe("html hygiene", () => {
  it("removes boilerplate and keeps the main content", () => {
    const html = `
      <html>
        <head>
          <title>Example</title>
          <style>body{display:none}</style>
          <script>console.log("noise")</script>
        </head>
        <body>
          <nav>Home About Pricing</nav>
          <main>
            <article>
              <h1>Product Launch</h1>
              <p>We ship a cleaner workflow.</p>
              <ul><li>Fast</li><li>Reliable</li></ul>
            </article>
          </main>
          <footer>Cookie banner and legal noise</footer>
        </body>
      </html>
    `;

    const result = cleanHtmlDocument(html);

    expect(result.title).toBe("Example");
    expect(result.rootSelector).toBe("main");
    expect(result.cleanHtml).toContain("Product Launch");
    expect(result.cleanHtml).toContain("We ship a cleaner workflow.");
    expect(result.cleanHtml).not.toContain("console.log");
    expect(result.cleanHtml).not.toContain("Cookie banner");
    expect(result.cleanText).toContain("Product Launch");
    expect(result.cleanText).toContain("Fast");
    expect(result.cleanText).not.toContain("Home About Pricing");
  });

  it("produces visible text from html", () => {
    const text = htmlToVisibleText("<div><header>Menu</header><p>Hello <strong>world</strong></p></div>");
    expect(text).toContain("Hello world");
    expect(text).not.toContain("Menu");
  });

  it("converts cleaned html into markdown", () => {
    const markdown = htmlToMarkdownDocument(`
      <main>
        <article>
          <h1>Design System</h1>
          <p>Build better <a href="https://example.com">components</a>.</p>
          <ul><li>Tokens</li><li>Patterns</li></ul>
        </article>
      </main>
    `);

    expect(markdown).toContain("# Design System");
    expect(markdown).toContain("[components](https://example.com)");
    expect(markdown).toContain("- Tokens");
    expect(markdown).toContain("- Patterns");
  });
});
