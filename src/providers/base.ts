/**
 * Base types and interface for the AI provider plugin system.
 *
 * All AI providers (OpenAI, Claude, Ollama) implement the AIProvider interface.
 * This abstraction lets the rest of the codebase stay provider-agnostic —
 * the generator just calls provider.generateComment() without caring which
 * LLM is behind it.
 */

/**
 * Context about a blog post, extracted by the scraper.
 * This is what the AI reads before generating a comment.
 */
export interface PostContext {
  /** Original URL of the blog post */
  url: string;
  /** Blog post title (used for discussion creation) */
  title: string;
  /** Full markdown content of the blog post (fed to the LLM) */
  content: string;
  /** Short excerpt / summary (first ~200 chars, used for previews) */
  excerpt: string;
}

/**
 * A persona controls how the AI "acts" when writing a comment.
 * Different personas produce different discussion angles on the same post.
 */
export interface Persona {
  name: string;
  description: string;
  tone: string;
}

/**
 * The contract every AI provider must fulfill.
 * Implementing this interface is all that's needed to add a new LLM backend.
 */
export interface AIProvider {
  /** Human-readable provider name (e.g., "openai", "claude") */
  name: string;

  /**
   * Generate a single discussion-starter comment for a blog post.
   *
   * @param context - The scraped blog post content and metadata.
   * @param persona - The persona to adopt when writing the comment.
   * @returns The generated comment text (plain markdown, no label prefix).
   */
  generateComment(context: PostContext, persona: Persona): Promise<string>;
}

/**
 * Build the system prompt that all providers share.
 * This ensures consistent comment quality regardless of which LLM is used.
 */
export function buildSystemPrompt(persona: Persona): string {
  return [
    `You are a blog commenter with the following persona:`,
    `- Name: ${persona.name}`,
    `- Role: ${persona.description}`,
    `- Tone: ${persona.tone}`,
    ``,
    `Instructions:`,
    `- Write a single, substantive comment on the blog post provided.`,
    `- Reference specific parts of the blog post to show genuine engagement.`,
    `- End with a question or invitation for further discussion.`,
    `- Do NOT use generic praise like "great article" or "nice post".`,
    `- Keep the comment concise (2-4 paragraphs).`,
    `- Write in first person as if you are the persona.`,
  ].join("\n");
}

/**
 * Build the user prompt containing the blog post content.
 * Kept separate from the system prompt so providers can slot it
 * into the correct message role.
 */
export function buildUserPrompt(context: PostContext): string {
  return [
    `Blog post: "${context.title}"`,
    `URL: ${context.url}`,
    ``,
    `---`,
    ``,
    context.content,
  ].join("\n");
}
