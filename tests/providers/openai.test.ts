/**
 * Tests for the OpenAI provider.
 *
 * Mocks the OpenAI SDK to verify:
 *   - System prompt includes persona details
 *   - User prompt includes blog post content
 *   - Response text is returned and trimmed
 *   - Empty responses throw an error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostContext, Persona } from "../../src/providers/base.js";

// Mock the OpenAI SDK before importing the provider.
// This replaces the real SDK with a controllable fake.
vi.mock("openai", () => {
  // Store the mock function so tests can configure its return value
  const createMock = vi.fn();
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: createMock,
        },
      };
    },
    __createMock: createMock,
  };
});

// Import after mocking so the provider gets the mocked SDK
import { OpenAIProvider } from "../../src/providers/openai.js";

// Get a reference to the mock so we can configure return values
const openaiModule = await import("openai");
const createMock = (openaiModule as any).__createMock as ReturnType<typeof vi.fn>;

// Shared test fixtures
const testContext: PostContext = {
  url: "https://example.com/blog/test",
  title: "Test Blog Post",
  content: "# Hello\n\nThis is a test blog post about testing.",
  excerpt: "This is a test blog post about testing.",
};

const testPersona: Persona = {
  name: "Curious Reader",
  description: "Asks thoughtful questions",
  tone: "friendly, inquisitive",
};

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider("gpt-4o", "test-api-key");
  });

  it("should have the correct provider name", () => {
    expect(provider.name).toBe("openai");
  });

  it("should call the OpenAI API with the correct prompt structure", async () => {
    // Configure the mock to return a successful response
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "Great insights on testing!" } }],
    });

    await provider.generateComment(testContext, testPersona);

    // Verify the API was called with the right parameters
    expect(createMock).toHaveBeenCalledOnce();
    const callArgs = createMock.mock.calls[0][0];

    // Model should match what was passed to the constructor
    expect(callArgs.model).toBe("gpt-4o");

    // System message should contain persona info
    expect(callArgs.messages[0].role).toBe("system");
    expect(callArgs.messages[0].content).toContain("Curious Reader");
    expect(callArgs.messages[0].content).toContain("friendly, inquisitive");

    // User message should contain the blog post
    expect(callArgs.messages[1].role).toBe("user");
    expect(callArgs.messages[1].content).toContain("Test Blog Post");
    expect(callArgs.messages[1].content).toContain("test blog post about testing");
  });

  it("should return trimmed comment text", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "  A thoughtful comment.  " } }],
    });

    const result = await provider.generateComment(testContext, testPersona);

    // Leading/trailing whitespace should be stripped
    expect(result).toBe("A thoughtful comment.");
  });

  it("should throw an error if the API returns an empty response", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    await expect(
      provider.generateComment(testContext, testPersona),
    ).rejects.toThrow("OpenAI returned an empty response");
  });
});
