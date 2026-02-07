/**
 * Blog content scraper.
 *
 * Fetches a blog post URL, extracts the article content using Readability,
 * and converts it to markdown for optimal LLM consumption.
 *
 * The pipeline: fetch HTML → parse DOM → Readability extract → HTML→markdown
 *
 * We use linkedom (not jsdom) because it's faster and lighter — we don't
 * need a full browser environment, just enough DOM to run Readability.
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import type { PostContext } from "../providers/base.js";

// Reusable Turndown instance for HTML→markdown conversion.
// Turndown produces cleaner markdown than raw HTML for LLM input,
// reducing token usage and improving comment quality.
const turndown = new TurndownService({
  headingStyle: "atx", // Use # style headings instead of underlines
  codeBlockStyle: "fenced", // Use ``` instead of indentation
});

/** Maximum content length sent to the LLM (in characters).
 * Blog posts can be very long; truncating prevents excessive token usage. */
const MAX_CONTENT_LENGTH = 15_000;

/** Excerpt length for previews and summaries */
const EXCERPT_LENGTH = 200;

/**
 * Fetch and extract clean article content from a blog post URL.
 *
 * @param url - The blog post URL to scrape.
 * @returns A PostContext with the post's title, content (as markdown), and excerpt.
 * @throws If the URL can't be fetched or no article content is found.
 */
export async function extractPost(url: string): Promise<PostContext> {
  // Step 1: Fetch the raw HTML with a browser-like User-Agent.
  // Some blogs block requests without a realistic UA string.
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; giscus-bot/1.0; +https://github.com/giscus-bot)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Step 2: Parse HTML into a DOM using linkedom.
  // linkedom gives us a lightweight Document object that Readability can work with.
  const { document } = parseHTML(html);

  // Step 3: Pre-clean elements that confuse Readability.
  // These elements add noise to the extracted content and aren't part of the article.
  const selectorsToRemove = [
    "nav",
    "footer",
    "header",
    ".sidebar",
    ".comments",
    ".advertisement",
    "script",
    "style",
    "iframe",
  ];
  for (const selector of selectorsToRemove) {
    for (const el of document.querySelectorAll(selector)) {
      el.remove();
    }
  }

  // Step 4: Run Readability to extract the main article content.
  // Readability is Mozilla's battle-tested article extractor (used in Firefox Reader View).
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.content) {
    throw new Error(`Could not extract article content from ${url}`);
  }

  // Step 5: Convert the extracted HTML to markdown.
  // Markdown is more token-efficient and reads more naturally for LLMs.
  let markdown = turndown.turndown(article.content);

  // Step 6: Truncate if the content is too long.
  // This prevents blowing up LLM context windows and API costs.
  if (markdown.length > MAX_CONTENT_LENGTH) {
    markdown = markdown.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated]";
  }

  // Build an excerpt from the text content (strip markdown formatting)
  const plainText = article.textContent?.trim() ?? "";
  const excerpt = plainText.slice(0, EXCERPT_LENGTH);

  return {
    url,
    title: article.title || "Untitled",
    content: markdown,
    excerpt,
  };
}
