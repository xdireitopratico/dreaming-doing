/**
 * Edge Function shim for html-hygiene.
 *
 * Mirrors src/lib/html-hygiene.ts (consumed by Vite/Next app) with ONE
 * difference: cheerio is imported via the npm: specifier so the Supabase
 * Edge Function Deno bundler can resolve it. The bare "cheerio" specifier
 * the app uses depends on Vite's node_modules resolver and is rejected by
 * the Edge bundler with: "Relative import path "cheerio" not prefixed
 * with / or ./ or ../".
 *
 * Keep in sync with src/lib/html-hygiene.ts. If you change the algorithm
 * there, mirror it here.
 */
import * as cheerio from "npm:cheerio@1.0.0-rc.12";

export type HtmlHygieneResult = {
  cleanHtml: string;
  cleanText: string;
  title: string;
  rootSelector: string;
};

const ROOT_SELECTORS = [
  "main",
  "article",
  '[role="main"]',
  '[itemprop="mainContentOfPage"]',
  "#content",
  "#main",
  ".content",
  ".main",
  ".article",
  ".post",
  ".entry-content",
  ".page-content",
  "[data-testid=\"content\"]",
];

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "svg",
  "canvas",
  "object",
  "embed",
  "link",
  "meta",
  "button",
  "input",
  "select",
  "textarea",
  "form",
  "dialog",
  "header",
  "audio",
  "video",
  "source",
  "nav",
  "footer",
  "aside",
];

const NOISE_ATTR_RE = /(?:cookie|banner|modal|popup|overlay|newsletter|subscribe|promo|advert|ads?|sidebar|breadcrumb|social|share|consent|toolbar|chat-widget|announcement|sticky|toast|skeleton|loader|loading)/i;
const HIDDEN_STYLE_RE = /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)/i;

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentScore($: any, node: any): number {
  const text = normalizeWhitespace(node.text());
  if (!text) return 0;

  const tag = String(node[0]?.name ?? node[0]?.tagName ?? "").toLowerCase();
  const textLength = text.length;
  const paragraphCount = node.find("p").length;
  const headingCount = node.find("h1,h2,h3,h4,h5,h6").length;
  const listCount = node.find("li").length;
  const codeCount = node.find("pre,code").length;
  const tableCount = node.find("table").length;
  const linkTextLength = normalizeWhitespace(node.find("a").text()).length;
  const linkDensity = textLength > 0 ? linkTextLength / textLength : 0;
  const classId = `${String(node.attr("id") ?? "")} ${String(node.attr("class") ?? "")}`;
  const noisePenalty = NOISE_ATTR_RE.test(classId) ? 250 : 0;
  const structuralBonus = ["main", "article", "section"].includes(tag) ? 120 : 0;
  const bodyPenalty = tag === "body" || tag === "html" ? 140 : 0;

  return (
    textLength +
    paragraphCount * 90 +
    headingCount * 75 +
    listCount * 18 +
    codeCount * 60 +
    tableCount * 45 -
    linkDensity * 220 -
    noisePenalty +
    structuralBonus -
    bodyPenalty
  );
}

function dropNoiseNodes($: any, root: any): void {
  for (const selector of NOISE_SELECTORS) {
    root.find(selector).remove();
  }

  root.find("[hidden], [aria-hidden='true']").remove();

  root.find("*").each((_index: number, element: any) => {
    const node = $(element);
    const classId = `${String(node.attr("id") ?? "")} ${String(node.attr("class") ?? "")}`;
    const style = String(node.attr("style") ?? "");
    if (NOISE_ATTR_RE.test(classId) || HIDDEN_STYLE_RE.test(style)) {
      node.remove();
    }
  });
}

function pickContentRoot($: any): { node: any; selector: string } {
  const body = $("body");
  const fallback = body.length ? body : $("html");
  let best = fallback;
  let bestSelector = body.length ? "body" : "html";
  let bestScore = contentScore($, best);

  for (const selector of ROOT_SELECTORS) {
    $(selector).each((_index: number, element: any) => {
      const node = $(element);
      const score = contentScore($, node);
      if (score > bestScore) {
        best = node;
        bestSelector = selector;
        bestScore = score;
      }
    });
  }

  return { node: best, selector: bestSelector };
}

function serializeCleanHtml(root: any, selector: string): string {
  if (selector === "body" || selector === "html") {
    return normalizeWhitespace(root.html() ?? "");
  }
  const html = root.clone().html() ?? root.clone().toString();
  return normalizeWhitespace(html);
}

function isInlineTag(tag: string): boolean {
  return new Set(["a", "abbr", "b", "code", "em", "i", "kbd", "mark", "q", "span", "strong", "sub", "sup", "u"]).has(tag);
}

function renderInlineText(value: string): string {
  return normalizeWhitespace(value);
}

function renderNode(node: any, ordered = false, index = 1): string {
  if (!node) return "";

  if (node.type === "text") {
    return renderInlineText(String(node.data ?? ""));
  }

  if (node.type !== "tag" && node.type !== "script" && node.type !== "style") {
    return "";
  }

  const tag = String(node.name ?? "").toLowerCase();
  const children = Array.isArray(node.children) ? node.children : [];
  const renderChildren = () => children.map((child: any) => renderNode(child, ordered, index)).join("");

  if (tag === "br") return "\n";

  if (tag === "img") {
    const alt = renderInlineText(String(node.attribs?.alt ?? ""));
    const src = String(node.attribs?.src ?? "").trim();
    return src ? `![${alt}](${src})` : alt;
  }

  if (tag === "a") {
    const href = String(node.attribs?.href ?? "").trim();
    const text = normalizeWhitespace(renderChildren()) || href;
    return href ? `[${text}](${href})` : text;
  }

  if (tag === "code") {
    const code = String(node.children?.[0]?.data ?? node.data ?? "").trim();
    return `\`${code.replace(/`/g, "\\`")}\``;
  }

  if (tag === "pre") {
    const code = String(node.text?.() ?? "").replace(/\n{3,}/g, "\n\n").trim();
    return code ? `\`\`\`\n${code}\n\`\`\`` : "";
  }

  if (tag === "blockquote") {
    const body = normalizeWhitespace(renderChildren());
    return body ? body.split(/\n+/).map((line) => `> ${line}`).join("\n") : "";
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    const body = normalizeWhitespace(renderChildren());
    return body ? `${"#".repeat(level)} ${body}` : "";
  }

  if (tag === "li") {
    const body = normalizeWhitespace(renderChildren());
    return body ? `${"-"} ${body}` : "";
  }

  if (tag === "ul" || tag === "ol") {
    const items = children.filter((child: any) => child?.name === "li");
    const lines = items.map((item: any, childIndex: number) => {
      const body = normalizeWhitespace(renderChildrenForListItem(item));
      const prefix = tag === "ol" ? `${childIndex + 1}.` : "-";
      return body ? `${prefix} ${body}` : "";
    }).filter(Boolean);
    return lines.join("\n");
  }

  if (tag === "table") {
    const rows = children.filter((child: any) => child?.name === "thead" || child?.name === "tbody" || child?.name === "tfoot" || child?.name === "tr")
      .flatMap((section: any) => section.name === "tr" ? [section] : (Array.isArray(section.children) ? section.children.filter((row: any) => row?.name === "tr") : []));
    const rendered = rows.map((row: any) => {
      const cells = Array.isArray(row.children) ? row.children.filter((cell: any) => cell?.name === "td" || cell?.name === "th") : [];
      return cells.map((cell: any) => normalizeWhitespace(renderChildrenFromNode(cell))).join(" | ");
    }).filter(Boolean);
    return rendered.length ? rendered.join("\n") : "";
  }

  if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "main" || tag === "header" || tag === "footer" || tag === "aside") {
    const body = normalizeWhitespace(renderChildren());
    return body;
  }

  if (tag === "strong" || tag === "b") {
    const body = normalizeWhitespace(renderChildren());
    return body ? `**${body}**` : "";
  }

  if (tag === "em" || tag === "i") {
    const body = normalizeWhitespace(renderChildren());
    return body ? `*${body}*` : "";
  }

  if (isInlineTag(tag)) {
    return renderChildren();
  }

  return renderChildren();
}

function renderChildrenFromNode(node: any): string {
  if (!node) return "";
  return Array.isArray(node.children) ? node.children.map((child: any) => renderNode(child)).join("") : "";
}

function renderChildrenForListItem(node: any): string {
  if (!node) return "";
  const rendered = Array.isArray(node.children) ? node.children.map((child: any) => {
    if (child?.name === "ul" || child?.name === "ol") {
      const nested = renderNode(child);
      return nested ? `\n${nested.split("\n").map((line: string) => `  ${line}`).join("\n")}` : "";
    }
    return renderNode(child);
  }).join("") : "";
  return rendered;
}

export function htmlToMarkdownDocument(rawHtml: string): string {
  const $ = cheerio.load(rawHtml || "");
  const { node: root } = pickContentRoot($);
  dropNoiseNodes($, root);

  const rootNode = root[0] as any;
  const rendered = renderChildrenFromNode(rootNode)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return rendered;
}

export function cleanHtmlDocument(rawHtml: string): HtmlHygieneResult {
  const $ = cheerio.load(rawHtml || "");

  const title = normalizeWhitespace($("title").first().text() || $("meta[property='og:title']").attr("content") || $("h1").first().text());
  const { node: root, selector } = pickContentRoot($);

  dropNoiseNodes($, root);

  const cleanHtml = serializeCleanHtml(root, selector);
  const cleanText = normalizeWhitespace(root.text());

  return {
    cleanHtml,
    cleanText,
    title,
    rootSelector: selector,
  };
}

export function htmlToVisibleText(rawHtml: string): string {
  return cleanHtmlDocument(rawHtml).cleanText;
}
