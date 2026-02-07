/**
 * Tests for the blog content scraper.
 *
 * Uses a mock HTTP server approach: we mock global `fetch` to return
 * controlled HTML, then verify that Readability + Turndown produce
 * the expected PostContext output.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractPost } from "../../src/core/scraper.js";

describe("extractPost", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should extract title and content from a well-structured HTML page", async () => {
    // Simulate a typical blog post HTML structure
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>My Test Post</title></head>
      <body>
        <nav><a href="/">Home</a></nav>
        <article>
          <h1>My Test Post</h1>
          <p>This is the introduction paragraph of a blog post about testing strategies.</p>
          <h2>Section One</h2>
          <p>Here we discuss unit testing and why it matters for code quality and reliability.</p>
          <h2>Section Two</h2>
          <p>Integration testing is also crucial for ensuring components work together properly.</p>
        </article>
        <footer><p>Copyright 2024</p></footer>
      </body>
      </html>
    `;

    // Mock fetch to return our controlled HTML
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await extractPost("https://example.com/blog/test-post");

    // Verify the extracted data
    expect(result.url).toBe("https://example.com/blog/test-post");
    expect(result.title).toBe("My Test Post");
    // Content should be markdown (converted from HTML by Turndown)
    expect(result.content).toContain("testing strategies");
    expect(result.content).toContain("unit testing");
    // Nav and footer should have been removed before extraction
    expect(result.content).not.toContain("Copyright");
    // Excerpt should be a short text snippet
    expect(result.excerpt.length).toBeLessThanOrEqual(200);
  });

  it("should throw on non-200 HTTP responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404, statusText: "Not Found" }),
    );

    await expect(
      extractPost("https://example.com/nonexistent"),
    ).rejects.toThrow("Failed to fetch");
  });

  it("should throw when no article content can be extracted", async () => {
    // A page with no discernible article content
    const html = `
      <!DOCTYPE html>
      <html><body><nav>Just navigation</nav></body></html>
    `;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, { status: 200 }),
    );

    await expect(
      extractPost("https://example.com/empty"),
    ).rejects.toThrow("Could not extract article content");
  });

  it("should truncate very long content", async () => {
    // Generate a very long article (>15000 chars)
    const longParagraph = "A".repeat(20_000);
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Long Post</title></head>
      <body>
        <article>
          <h1>Long Post</h1>
          <p>${longParagraph}</p>
        </article>
      </body>
      </html>
    `;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, { status: 200 }),
    );

    const result = await extractPost("https://example.com/long");

    // Content should be truncated with a marker
    expect(result.content).toContain("[Content truncated]");
    // Total length should be approximately MAX_CONTENT_LENGTH + truncation marker
    expect(result.content.length).toBeLessThan(16_000);
  });
});
