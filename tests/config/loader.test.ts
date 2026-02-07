/**
 * Tests for the configuration loader.
 *
 * Verifies:
 *   - YAML parsing produces the correct config structure
 *   - ${VAR_NAME} syntax is replaced with environment variable values
 *   - Missing env vars are replaced with empty strings (fail-open)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../src/config/loader.js";

// Use a temp file path for test configs
const TEST_CONFIG_PATH = join(import.meta.dirname, "test-config.yaml");

describe("loadConfig", () => {
  afterEach(() => {
    // Clean up temp config files after each test
    try {
      unlinkSync(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it("should parse a valid YAML config file", () => {
    // Write a minimal valid config to a temp file
    writeFileSync(
      TEST_CONFIG_PATH,
      `
provider:
  name: openai
  model: gpt-4o

github:
  repo: "user/blog"
  discussionCategory: "Blog Comments"

personas:
  - name: "Curious Reader"
    description: "Asks questions"
    tone: "friendly"

limits:
  maxPersonas: 1

labeling:
  prefix: "🤖 AI Comment"
`,
    );

    const config = loadConfig(TEST_CONFIG_PATH);

    // Verify all top-level fields are present and correct
    expect(config.provider.name).toBe("openai");
    expect(config.provider.model).toBe("gpt-4o");
    expect(config.github.repo).toBe("user/blog");
    expect(config.github.discussionCategory).toBe("Blog Comments");
    expect(config.personas).toHaveLength(1);
    expect(config.personas[0].name).toBe("Curious Reader");
    expect(config.limits.maxPersonas).toBe(1);
    expect(config.labeling.prefix).toBe("🤖 AI Comment");
  });

  it("should interpolate environment variables with ${VAR} syntax", () => {
    // Set a test env var that the config will reference
    process.env.TEST_GISCUS_MODEL = "gpt-4-turbo";

    writeFileSync(
      TEST_CONFIG_PATH,
      `
provider:
  name: openai
  model: \${TEST_GISCUS_MODEL}

github:
  repo: "user/blog"
  discussionCategory: "Comments"

personas:
  - name: "Reader"
    description: "Reads"
    tone: "nice"

limits:
  maxPersonas: 1

labeling:
  prefix: "AI"
`,
    );

    const config = loadConfig(TEST_CONFIG_PATH);

    // The ${TEST_GISCUS_MODEL} should be replaced with the env var value
    expect(config.provider.model).toBe("gpt-4-turbo");

    // Clean up
    delete process.env.TEST_GISCUS_MODEL;
  });

  it("should replace missing env vars with empty strings", () => {
    // Make sure this var doesn't exist
    delete process.env.NONEXISTENT_VAR;

    writeFileSync(
      TEST_CONFIG_PATH,
      `
provider:
  name: openai
  model: \${NONEXISTENT_VAR}

github:
  repo: "user/blog"
  discussionCategory: "Comments"

personas:
  - name: "Reader"
    description: "Reads"
    tone: "nice"

limits:
  maxPersonas: 1

labeling:
  prefix: "AI"
`,
    );

    const config = loadConfig(TEST_CONFIG_PATH);

    // Missing env vars become empty strings in the raw text, but YAML
    // parses an empty unquoted value as null
    expect(config.provider.model).toBeNull();
  });

  it("should throw for a nonexistent config file", () => {
    expect(() => loadConfig("/nonexistent/path.yaml")).toThrow();
  });
});
