/**
 * Comment generator — the main orchestrator.
 *
 * This module wires together all the pieces:
 *   1. Scraper extracts blog post content
 *   2. AI provider generates comments using personas
 *   3. Publisher posts comments to GitHub Discussions
 *
 * It also handles the --dry-run mode (preview without posting)
 * and formats comments with the AI-generated label.
 */

import type { GiscusBotConfig } from "../config/types.js";
import type { AIProvider, PostContext } from "../providers/base.js";
import { extractPost } from "./scraper.js";
import * as publisher from "./publisher.js";

/** Result of a single comment generation */
export interface CommentResult {
  personaName: string;
  comment: string;
  /** The formatted comment including the AI label prefix */
  formattedComment: string;
}

/** Result of the full generation pipeline */
export interface GenerateResult {
  postTitle: string;
  postUrl: string;
  discussionUrl: string | null; // null in dry-run mode
  comments: CommentResult[];
}

/**
 * Format a generated comment with the AI-generated label prefix.
 *
 * Every AI comment is clearly labeled for transparency. This builds trust
 * with readers and is a core design principle of giscus-bot.
 */
function formatComment(
  comment: string,
  personaName: string,
  labelPrefix: string,
): string {
  return `${labelPrefix} · Persona: ${personaName}\n\n${comment}`;
}

/**
 * Run the full comment generation pipeline for a blog post.
 *
 * Accepts either a URL (scrapes the live page) or a pre-built PostContext
 * (e.g., from reading a local markdown file in the push-trigger path).
 *
 * @param urlOrContext - A blog post URL string, or a PostContext object.
 * @param config - The full giscus-bot configuration.
 * @param provider - The AI provider to use for generating comments.
 * @param options.dryRun - If true, generate comments but don't post to GitHub.
 * @returns Results including the generated comments and discussion URL.
 */
export async function generate(
  urlOrContext: string | PostContext,
  config: GiscusBotConfig,
  provider: AIProvider,
  options: { dryRun?: boolean } = {},
): Promise<GenerateResult> {
  // Step 1: Get the post content — either scrape the URL or use the provided context
  const postContext: PostContext =
    typeof urlOrContext === "string"
      ? await extractPost(urlOrContext)
      : urlOrContext;

  // Step 2: Select personas (cap at maxPersonas from config)
  // If the user defines 5 personas but maxPersonas is 2, only use the first 2
  const personaCount = Math.min(
    config.limits.maxPersonas,
    config.personas.length,
  );
  const selectedPersonas = config.personas.slice(0, personaCount);

  // Step 3: Generate a comment for each persona
  // We run these sequentially to be respectful of API rate limits
  const comments: CommentResult[] = [];
  for (const persona of selectedPersonas) {
    const comment = await provider.generateComment(postContext, persona);
    const formattedComment = formatComment(
      comment,
      persona.name,
      config.labeling.prefix,
    );
    comments.push({
      personaName: persona.name,
      comment,
      formattedComment,
    });
  }

  // Step 4: Post to GitHub (unless dry-run)
  let discussionUrl: string | null = null;

  if (!options.dryRun) {
    // Parse "owner/repo" from config
    const [owner, repo] = config.github.repo.split("/");
    if (!owner || !repo) {
      throw new Error(
        `Invalid repo format "${config.github.repo}". Expected "owner/repo".`,
      );
    }

    // Create or find the discussion for this blog post
    const discussionBody = `Discussion for: ${postContext.title}`;
    const discussion = await publisher.findOrCreateDiscussion(
      owner,
      repo,
      config.github.discussionCategory,
      postContext.title,
      discussionBody,
    );

    discussionUrl = discussion.url;

    // Post each generated comment as a top-level comment on the discussion
    for (const result of comments) {
      await publisher.addComment(discussion.id, result.formattedComment);
    }
  }

  return {
    postTitle: postContext.title,
    postUrl: postContext.url,
    discussionUrl,
    comments,
  };
}
