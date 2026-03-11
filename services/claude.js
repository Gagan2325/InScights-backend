const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt, buildGenerationPrompt } = require('../prompts/inscights');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Generate paired Need + Solution statements via Claude.
 * Returns parsed JSON or throws a structured error.
 */
async function generateContent(brief) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildGenerationPrompt(brief);

  console.log(`[Claude] Generating for molecule: ${brief.molecule}`);

  let rawContent = '';

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });

    rawContent = message.content[0]?.text || '';

    // Strip any markdown fences if Claude adds them
    const cleaned = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    // Validate basic structure
    if (!parsed.pairs || !Array.isArray(parsed.pairs)) {
      throw new Error('Invalid response structure: missing pairs array');
    }

    console.log(`[Claude] Generated ${parsed.pairs.length} pairs successfully`);
    return parsed;

  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('[Claude] JSON parse error. Raw response:', rawContent.substring(0, 500));
      throw new Error('AI returned malformed content. Please try again.');
    }
    throw err;
  }
}

module.exports = { generateContent };
