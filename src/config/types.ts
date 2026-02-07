/**
 * Configuration type definitions for giscus-bot.
 *
 * These types mirror the structure of giscus-bot.config.yaml.
 * The config file is the primary way users customize bot behavior.
 */

/** Supported AI provider names */
export type ProviderName = "openai" | "claude" | "ollama";

/** AI provider configuration — which LLM to use and what model */
export interface ProviderConfig {
  name: ProviderName;
  model: string;
}

/** GitHub repository + discussion category targeting */
export interface GithubConfig {
  /** Format: "owner/repo" (e.g., "user/blog") */
  repo: string;
  /** The Discussions category to post comments in (e.g., "Blog Comments") */
  discussionCategory: string;
}

/**
 * Site configuration — needed for auto-trigger mode to convert
 * file paths (e.g., _posts/2024-01-01-my-post.md) into live URLs.
 */
export interface SiteConfig {
  /** Base URL of the blog (e.g., "https://myblog.com") — no trailing slash */
  url: string;
  /**
   * Blog framework used — determines how filenames map to URLs.
   *   - jekyll: _posts/YYYY-MM-DD-slug.md → /YYYY/MM/DD/slug/
   *   - hugo:   content/posts/slug.md     → /posts/slug/
   *   - custom: use pathPattern to define the mapping
   */
  framework: "jekyll" | "hugo" | "custom";
  /**
   * Custom URL pattern for "custom" framework. Uses placeholders:
   *   {slug}, {year}, {month}, {day}, {filename}
   * Example: "/blog/{year}/{slug}/"
   */
  pathPattern?: string;
}

/**
 * A persona defines the AI's "character" when generating a comment.
 * Multiple personas allow diverse discussion starters on the same post.
 */
export interface PersonaConfig {
  /** Display name shown in the comment header (e.g., "Curious Reader") */
  name: string;
  /** Instructions for the LLM about how this persona behaves */
  description: string;
  /** Adjectives describing the persona's writing style */
  tone: string;
}

/** Rate-limiting and resource controls */
export interface LimitsConfig {
  /** Max number of personas to use per blog post (caps AI API calls) */
  maxPersonas: number;
}

/** Controls the AI-generated label prepended to each comment */
export interface LabelingConfig {
  /** Markdown text prepended to every AI comment for transparency */
  prefix: string;
}

/** Top-level configuration object — the full config file shape */
export interface GiscusBotConfig {
  provider: ProviderConfig;
  github: GithubConfig;
  /** Site config — required for push-trigger URL construction */
  site?: SiteConfig;
  personas: PersonaConfig[];
  limits: LimitsConfig;
  labeling: LabelingConfig;
}
