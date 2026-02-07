/**
 * GitHub Action entry point for giscus-bot.
 *
 * This module bridges the GitHub Action runtime (inputs/outputs) with
 * the core giscus-bot logic. It supports two trigger modes:
 *
 *   1. Manual trigger (workflow_dispatch): User provides a blog-url input
 *   2. Push trigger: Detects new/modified markdown files and constructs
 *      live URLs using the site config (framework-aware)
 *
 * The action reads inputs via @actions/core, sets up the config with
 * appropriate overrides, and runs the same generate() pipeline as the CLI.
 */

import * as core from "@actions/core";
import * as github from "@actions/github";
import { loadConfig } from "./config/loader.js";
import { createProvider } from "./providers/index.js";
import { generate } from "./core/generator.js";
import type { ProviderName, SiteConfig } from "./config/types.js";
import { basename } from "node:path";

/**
 * Map provider names to their corresponding environment variable names.
 * The action's api-key input gets set to the correct env var so that
 * provider constructors can find it automatically.
 */
const PROVIDER_ENV_MAP: Record<string, string> = {
  openai: "GISCUS_BOT_OPENAI_API_KEY",
  claude: "GISCUS_BOT_CLAUDE_API_KEY",
};

/**
 * Convert a Jekyll post filename to a live URL.
 *
 * Jekyll naming convention:
 *   _posts/YYYY-MM-DD-slug-title.md → /YYYY/MM/DD/slug-title/
 *
 * Examples:
 *   _posts/2024-06-15-hello-world.md  → https://myblog.com/2024/06/15/hello-world/
 *   _posts/2024-01-01-my-first-post.md → https://myblog.com/2024/01/01/my-first-post/
 */
function jekyllFileToPath(filePath: string): string {
  // Extract just the filename without directory and extension
  const filename = basename(filePath).replace(/\.(md|mdx|markdown|html)$/, "");

  // Jekyll filenames follow the pattern: YYYY-MM-DD-slug
  const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
  if (!match) {
    // If it doesn't match Jekyll's date-slug pattern, use filename as-is
    return `/${filename}/`;
  }

  const [, year, month, day, slug] = match;
  return `/${year}/${month}/${day}/${slug}/`;
}

/**
 * Convert a Hugo content file path to a URL path.
 *
 * Hugo convention:
 *   content/posts/my-post.md → /posts/my-post/
 *   content/blog/2024/intro.md → /blog/2024/intro/
 *
 * Strips the "content/" prefix and the file extension.
 */
function hugoFileToPath(filePath: string): string {
  // Remove the "content/" prefix and file extension
  const withoutPrefix = filePath.replace(/^content\//, "");
  const withoutExt = withoutPrefix.replace(/\.(md|mdx|html)$/, "");

  // Hugo uses index.md for section pages — strip it
  const cleaned = withoutExt.replace(/\/index$/, "");
  return `/${cleaned}/`;
}

/**
 * Convert a file path to a URL path using a custom pattern.
 *
 * Supported placeholders:
 *   {slug}     — filename without extension and date prefix
 *   {filename} — full filename without extension
 *   {year}, {month}, {day} — from Jekyll-style date prefix (if present)
 *
 * Example pattern: "/blog/{year}/{slug}/"
 */
function customFileToPath(filePath: string, pattern: string): string {
  const filename = basename(filePath).replace(/\.(md|mdx|markdown|html)$/, "");

  // Try to extract date parts from Jekyll-style filenames
  const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
  const year = match?.[1] ?? "";
  const month = match?.[2] ?? "";
  const day = match?.[3] ?? "";
  const slug = match?.[4] ?? filename;

  return pattern
    .replace("{slug}", slug)
    .replace("{filename}", filename)
    .replace("{year}", year)
    .replace("{month}", month)
    .replace("{day}", day);
}

/**
 * Convert a repository file path to a full live blog URL.
 *
 * Uses the site config to determine the framework and construct the URL.
 * This is the key function that bridges "file pushed to repo" → "live URL to scrape".
 */
function filePathToUrl(filePath: string, site: SiteConfig): string {
  const baseUrl = site.url.replace(/\/$/, ""); // strip trailing slash

  let path: string;
  switch (site.framework) {
    case "jekyll":
      path = jekyllFileToPath(filePath);
      break;
    case "hugo":
      path = hugoFileToPath(filePath);
      break;
    case "custom":
      if (!site.pathPattern) {
        throw new Error(
          'site.pathPattern is required when framework is "custom"',
        );
      }
      path = customFileToPath(filePath, site.pathPattern);
      break;
    default:
      throw new Error(`Unknown site framework: ${site.framework}`);
  }

  return `${baseUrl}${path}`;
}

async function run(): Promise<void> {
  try {
    // Read GitHub Action inputs
    const githubToken = core.getInput("github-token", { required: true });
    const providerName = core.getInput("provider", { required: true });
    const apiKey = core.getInput("api-key", { required: true });
    const model = core.getInput("model") || "gpt-4o";
    const blogUrl = core.getInput("blog-url");
    const configPath = core.getInput("config-path") || "giscus-bot.config.yaml";

    // Set env vars so that provider constructors and publisher can find them
    process.env.GISCUS_BOT_GITHUB_TOKEN = githubToken;
    if (PROVIDER_ENV_MAP[providerName]) {
      process.env[PROVIDER_ENV_MAP[providerName]] = apiKey;
    }

    // Load config from the repo's config file
    const config = loadConfig(configPath);

    // Override provider settings from action inputs
    config.provider.name = providerName as ProviderName;
    config.provider.model = model;

    const provider = createProvider(config.provider);

    // Determine which URLs to process
    const urls: string[] = [];

    if (blogUrl) {
      // Manual trigger (workflow_dispatch): use the provided URL directly
      urls.push(blogUrl);
    } else {
      // Push trigger: detect new/modified markdown files from the commit
      // and convert file paths to live URLs using site config
      if (!config.site) {
        core.setFailed(
          'Push-trigger mode requires a "site" section in config with url and framework. ' +
          "Alternatively, use workflow_dispatch with a blog-url input.",
        );
        return;
      }

      const payload = github.context.payload;

      if (payload.commits) {
        // Collect all added/modified markdown files from the push commits
        for (const commit of payload.commits) {
          const files = [
            ...(commit.added ?? []),
            ...(commit.modified ?? []),
          ] as string[];

          for (const file of files) {
            // Only process markdown files in common blog content directories
            if (
              file.match(/\.(md|mdx)$/) &&
              file.match(/^(content|_posts|src\/posts|posts|blog)\//)
            ) {
              // Convert the repo file path to a live blog URL
              const liveUrl = filePathToUrl(file, config.site);
              core.info(`Mapped ${file} → ${liveUrl}`);
              urls.push(liveUrl);
            }
          }
        }
      }

      if (urls.length === 0) {
        core.info("No new blog posts detected in this push. Nothing to do.");
        return;
      }
    }

    // Process each URL through the generation pipeline
    for (const url of urls) {
      core.info(`Processing: ${url}`);

      const result = await generate(url, config, provider);

      core.info(`Generated ${result.comments.length} comment(s) for "${result.postTitle}"`);
      if (result.discussionUrl) {
        core.info(`Discussion: ${result.discussionUrl}`);
      }
    }

    // Set outputs for downstream steps in the workflow
    core.setOutput("comments-generated", urls.length.toString());
  } catch (error) {
    // Mark the action as failed with a clear error message
    core.setFailed(
      error instanceof Error ? error.message : String(error),
    );
  }
}

// Execute the action
run();
