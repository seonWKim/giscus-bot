/**
 * Tests for the blog content scraper.
 *
 * Uses a mock HTTP server approach: we mock global `fetch` to return
 * controlled HTML, then verify that Readability + Turndown produce
 * the expected PostContext output.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { extractPost, extractPostFromFile } from "../../src/core/scraper.js";

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

// Path for temp test files
const TEST_FILE_PATH = join(import.meta.dirname, "test-post.md");

describe("extractPostFromFile", () => {
  afterEach(() => {
    try {
      unlinkSync(TEST_FILE_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it("should extract title from YAML front matter and body content", () => {
    writeFileSync(
      TEST_FILE_PATH,
      `---
title: "MySQL MVCC and Isolation Levels"
date: 2026-01-18
categories: [ programming ]
---

# Introduction

This post explains how MySQL implements MVCC.

## Section One

InnoDB uses undo logs to maintain multiple versions of rows.
`,
    );

    const result = extractPostFromFile(TEST_FILE_PATH);

    expect(result.title).toBe("MySQL MVCC and Isolation Levels");
    expect(result.content).toContain("MVCC");
    expect(result.content).toContain("undo logs");
    // Front matter YAML should NOT appear in the content
    expect(result.content).not.toContain("categories");
  });

  it("should handle unquoted titles in front matter", () => {
    writeFileSync(
      TEST_FILE_PATH,
      `---
title: My Unquoted Title
date: 2026-01-01
---

Some content here.
`,
    );

    const result = extractPostFromFile(TEST_FILE_PATH);
    expect(result.title).toBe("My Unquoted Title");
  });

  it("should default to 'Untitled' when no front matter exists", () => {
    writeFileSync(TEST_FILE_PATH, "# Just a heading\n\nSome content.");

    const result = extractPostFromFile(TEST_FILE_PATH);
    expect(result.title).toBe("Untitled");
    expect(result.content).toContain("Just a heading");
  });

  it("should use the file path as the url field", () => {
    writeFileSync(
      TEST_FILE_PATH,
      `---
title: Test
---

Content.
`,
    );

    const result = extractPostFromFile(TEST_FILE_PATH);
    expect(result.url).toBe(TEST_FILE_PATH);
  });
});
