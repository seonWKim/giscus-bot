/**
 * Tests for the comment generator (orchestrator).
 *
 * Uses mocked scraper, provider, and publisher to verify the
 * orchestration logic without making real HTTP or API calls.
 *
 * Verifies:
 *   - Persona selection respects maxPersonas limit
 *   - Comments are formatted with the AI label prefix
 *   - Dry-run mode skips publishing
 *   - Normal mode calls publisher for each comment
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GiscusBotConfig } from "../../src/config/types.js";
import type { AIProvider, PostContext } from "../../src/providers/base.js";

// Mock the scraper — we don't want real HTTP requests in tests
vi.mock("../../src/core/scraper.js", () => ({
  extractPost: vi.fn(),
}));

// Mock the publisher — we don't want real GitHub API calls
vi.mock("../../src/core/publisher.js", () => ({
  findOrCreateDiscussion: vi.fn(),
  addComment: vi.fn(),
}));

import { generate } from "../../src/core/generator.js";
import { extractPost } from "../../src/core/scraper.js";
import * as publisher from "../../src/core/publisher.js";

// Cast mocks for type-safe access to mock methods
const mockExtractPost = vi.mocked(extractPost);
const mockFindOrCreate = vi.mocked(publisher.findOrCreateDiscussion);
const mockAddComment = vi.mocked(publisher.addComment);

// Fake post context returned by the mocked scraper
const fakePostContext: PostContext = {
  url: "https://blog.example.com/post",
  title: "Test Post Title",
  content: "# Test\n\nSome content about testing.",
  excerpt: "Some content about testing.",
};

// A fake AI provider that returns predictable comments
const fakeProvider: AIProvider = {
  name: "fake",
  generateComment: vi.fn(async (_ctx, persona) => {
    return `Comment from ${persona.name}`;
  }),
};

// Test configuration with two personas
const testConfig: GiscusBotConfig = {
  provider: { name: "openai", model: "gpt-4o" },
  github: { repo: "user/blog", discussionCategory: "Blog Comments" },
  personas: [
    { name: "Curious Reader", description: "Asks questions", tone: "friendly" },
    { name: "Devil's Advocate", description: "Counterpoints", tone: "analytical" },
    { name: "Third Persona", description: "Extra", tone: "neutral" },
  ],
  limits: { maxPersonas: 2 },
  labeling: { prefix: "🤖 **AI Comment**" },
};

describe("generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Scraper always returns our fake post
    mockExtractPost.mockResolvedValue(fakePostContext);
    // Publisher mocks
    mockFindOrCreate.mockResolvedValue({
      id: "D_1",
      url: "https://github.com/user/blog/discussions/1",
    });
    mockAddComment.mockResolvedValue({ id: "C_1" });
  });

  it("should generate comments for the configured number of personas", async () => {
    const result = await generate(
      "https://blog.example.com/post",
      testConfig,
      fakeProvider,
      { dryRun: true },
    );

    // maxPersonas is 2, so only 2 of 3 personas should be used
    expect(result.comments).toHaveLength(2);
    expect(result.comments[0].personaName).toBe("Curious Reader");
    expect(result.comments[1].personaName).toBe("Devil's Advocate");
  });

  it("should format comments with the AI label prefix", async () => {
    const result = await generate(
      "https://blog.example.com/post",
      testConfig,
      fakeProvider,
      { dryRun: true },
    );

    // Each formatted comment should start with the label prefix
    expect(result.comments[0].formattedComment).toContain("🤖 **AI Comment**");
    expect(result.comments[0].formattedComment).toContain("Persona: Curious Reader");
    expect(result.comments[0].formattedComment).toContain("Comment from Curious Reader");
  });

  it("should NOT call publisher in dry-run mode", async () => {
    const result = await generate(
      "https://blog.example.com/post",
      testConfig,
      fakeProvider,
      { dryRun: true },
    );

    // Discussion URL should be null in dry-run mode
    expect(result.discussionUrl).toBeNull();
    // Publisher should never be called
    expect(mockFindOrCreate).not.toHaveBeenCalled();
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("should call publisher for each comment in normal mode", async () => {
    const result = await generate(
      "https://blog.example.com/post",
      testConfig,
      fakeProvider,
      // No dryRun flag — should publish
    );

    // Discussion should have been created/found
    expect(result.discussionUrl).toBe("https://github.com/user/blog/discussions/1");
    expect(mockFindOrCreate).toHaveBeenCalledOnce();
    // One addComment call per persona
    expect(mockAddComment).toHaveBeenCalledTimes(2);
  });

  it("should pass the scraped post context to the provider", async () => {
    await generate(
      "https://blog.example.com/post",
      testConfig,
      fakeProvider,
      { dryRun: true },
    );

    // Verify the provider received the correct post context
    const generateComment = fakeProvider.generateComment as ReturnType<typeof vi.fn>;
    expect(generateComment).toHaveBeenCalledWith(
      fakePostContext,
      expect.objectContaining({ name: "Curious Reader" }),
    );
  });
});
