/**
 * Tests for the Claude (Anthropic) provider.
 *
 * Mocks the Anthropic SDK to verify:
 *   - The system prompt is passed via the dedicated `system` parameter
 *   - User message contains the blog post content
 *   - Response text blocks are extracted correctly
 *   - Non-text or empty responses throw errors
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostContext, Persona } from "../../src/providers/base.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  const createMock = vi.fn();
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
    __createMock: createMock,
  };
});

import { ClaudeProvider } from "../../src/providers/claude.js";

const anthropicModule = await import("@anthropic-ai/sdk");
const createMock = (anthropicModule as any).__createMock as ReturnType<typeof vi.fn>;

// Shared test fixtures
const testContext: PostContext = {
  url: "https://example.com/blog/test",
  title: "Test Blog Post",
  content: "# Hello\n\nThis is a test blog post.",
  excerpt: "This is a test blog post.",
};

const testPersona: Persona = {
  name: "Devil's Advocate",
  description: "Offers respectful counterpoints",
  tone: "constructive, analytical",
};

describe("ClaudeProvider", () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ClaudeProvider("claude-sonnet-4-5-20250929", "test-api-key");
  });

  it("should have the correct provider name", () => {
    expect(provider.name).toBe("claude");
  });

  it("should pass the system prompt as a dedicated parameter (not a message)", async () => {
    // Anthropic's API has a top-level `system` field, separate from messages
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "An interesting counterpoint." }],
    });

    await provider.generateComment(testContext, testPersona);

    expect(createMock).toHaveBeenCalledOnce();
    const callArgs = createMock.mock.calls[0][0];

    // Verify the system prompt is a top-level parameter, not inside messages
    expect(callArgs.system).toContain("Devil's Advocate");
    expect(callArgs.system).toContain("constructive, analytical");

    // Messages should only contain the user message with blog content
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe("user");
    expect(callArgs.messages[0].content).toContain("Test Blog Post");
  });

  it("should return trimmed text from the response", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "  A counterpoint.  " }],
    });

    const result = await provider.generateComment(testContext, testPersona);
    expect(result).toBe("A counterpoint.");
  });

  it("should throw if the response contains no text block", async () => {
    // Simulate an empty content array
    createMock.mockResolvedValueOnce({
      content: [],
    });

    await expect(
      provider.generateComment(testContext, testPersona),
    ).rejects.toThrow("Claude returned an empty or non-text response");
  });
});
