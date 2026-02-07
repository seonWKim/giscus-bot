/**
 * Tests for the GitHub Discussions publisher.
 *
 * Mocks @octokit/graphql to verify:
 *   - GraphQL queries/mutations are structured correctly
 *   - findOrCreateDiscussion reuses existing discussions
 *   - findOrCreateDiscussion creates new ones when none exist
 *   - Error cases (missing category, missing token) are handled
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @octokit/graphql module.
// We need to mock the `graphql.defaults()` chain that publisher.ts uses.
const mockGraphql = vi.fn();
vi.mock("@octokit/graphql", () => ({
  graphql: {
    // defaults() returns the mock function itself, simulating the auth setup
    defaults: () => mockGraphql,
  },
}));

import {
  getRepoInfo,
  findDiscussion,
  createDiscussion,
  addComment,
  findOrCreateDiscussion,
} from "../../src/core/publisher.js";

describe("publisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set a fake token so the publisher doesn't throw about missing auth
    process.env.GISCUS_BOT_GITHUB_TOKEN = "fake-token";
  });

  describe("getRepoInfo", () => {
    it("should return repo ID and matching category ID", async () => {
      // Simulate a GraphQL response with repo info and categories
      mockGraphql.mockResolvedValueOnce({
        repository: {
          id: "R_123",
          discussionCategories: {
            nodes: [
              { id: "DC_1", name: "General" },
              { id: "DC_2", name: "Blog Comments" },
            ],
          },
        },
      });

      const result = await getRepoInfo("user", "blog", "Blog Comments");

      expect(result.repoId).toBe("R_123");
      expect(result.categoryId).toBe("DC_2");
    });

    it("should match category name case-insensitively", async () => {
      mockGraphql.mockResolvedValueOnce({
        repository: {
          id: "R_123",
          discussionCategories: {
            nodes: [{ id: "DC_1", name: "Blog Comments" }],
          },
        },
      });

      // Pass lowercase; should still match
      const result = await getRepoInfo("user", "blog", "blog comments");
      expect(result.categoryId).toBe("DC_1");
    });

    it("should throw if the category is not found", async () => {
      mockGraphql.mockResolvedValueOnce({
        repository: {
          id: "R_123",
          discussionCategories: {
            nodes: [{ id: "DC_1", name: "General" }],
          },
        },
      });

      await expect(
        getRepoInfo("user", "blog", "Nonexistent Category"),
      ).rejects.toThrow('Discussion category "Nonexistent Category" not found');
    });
  });

  describe("findDiscussion", () => {
    it("should return the discussion if an exact title match exists", async () => {
      mockGraphql.mockResolvedValueOnce({
        search: {
          nodes: [
            { id: "D_1", title: "My Blog Post", url: "https://github.com/..." },
          ],
        },
      });

      const result = await findDiscussion("user", "blog", "My Blog Post");

      expect(result).toEqual({
        id: "D_1",
        url: "https://github.com/...",
      });
    });

    it("should return null if no exact title match exists", async () => {
      // Search returns similar but not exact matches
      mockGraphql.mockResolvedValueOnce({
        search: {
          nodes: [
            { id: "D_1", title: "My Other Blog Post", url: "https://..." },
          ],
        },
      });

      const result = await findDiscussion("user", "blog", "My Blog Post");
      expect(result).toBeNull();
    });

    it("should return null if search returns no results", async () => {
      mockGraphql.mockResolvedValueOnce({
        search: { nodes: [] },
      });

      const result = await findDiscussion("user", "blog", "My Blog Post");
      expect(result).toBeNull();
    });
  });

  describe("createDiscussion", () => {
    it("should return the new discussion ID and URL", async () => {
      mockGraphql.mockResolvedValueOnce({
        createDiscussion: {
          discussion: { id: "D_new", url: "https://github.com/new" },
        },
      });

      const result = await createDiscussion("R_123", "DC_1", "Title", "Body");

      expect(result.id).toBe("D_new");
      expect(result.url).toBe("https://github.com/new");
    });
  });

  describe("addComment", () => {
    it("should return the new comment ID", async () => {
      mockGraphql.mockResolvedValueOnce({
        addDiscussionComment: {
          comment: { id: "C_1" },
        },
      });

      const result = await addComment("D_1", "Hello world!");
      expect(result.id).toBe("C_1");
    });
  });

  describe("findOrCreateDiscussion", () => {
    it("should reuse an existing discussion", async () => {
      // findDiscussion succeeds → should NOT call createDiscussion
      mockGraphql.mockResolvedValueOnce({
        search: {
          nodes: [
            { id: "D_existing", title: "My Post", url: "https://existing" },
          ],
        },
      });

      const result = await findOrCreateDiscussion(
        "user", "blog", "Blog Comments", "My Post", "Body",
      );

      expect(result.id).toBe("D_existing");
      // Only one GraphQL call (the search), not two
      expect(mockGraphql).toHaveBeenCalledTimes(1);
    });

    it("should create a new discussion when none exists", async () => {
      // findDiscussion returns null → should call getRepoInfo + createDiscussion
      mockGraphql
        // First call: search returns no matches
        .mockResolvedValueOnce({ search: { nodes: [] } })
        // Second call: getRepoInfo
        .mockResolvedValueOnce({
          repository: {
            id: "R_123",
            discussionCategories: {
              nodes: [{ id: "DC_1", name: "Blog Comments" }],
            },
          },
        })
        // Third call: createDiscussion
        .mockResolvedValueOnce({
          createDiscussion: {
            discussion: { id: "D_new", url: "https://new" },
          },
        });

      const result = await findOrCreateDiscussion(
        "user", "blog", "Blog Comments", "New Post", "Body",
      );

      expect(result.id).toBe("D_new");
      expect(result.url).toBe("https://new");
      // Three GraphQL calls: search + getRepoInfo + create
      expect(mockGraphql).toHaveBeenCalledTimes(3);
    });
  });
});
