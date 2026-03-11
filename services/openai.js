const OpenAI = require('openai');
const { buildSystemPrompt, buildGenerationPrompt } = require('../prompts/inscights');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate paired Need + Solution statements via OpenAI.
 * Returns parsed JSON or throws a structured error.
 */
async function generateContent(brief) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildGenerationPrompt(brief);

  console.log(`[OpenAI] Generating for molecule: ${brief.molecule}`);

  let rawContent = '';

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    rawContent = completion.choices[0]?.message?.content || '';

    // Strip any markdown fences if OpenAI adds them
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

    console.log(`[OpenAI] Generated ${parsed.pairs.length} pairs successfully`);
    return parsed;

  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('[OpenAI] JSON parse error. Raw response:', rawContent.substring(0, 500));
      throw new Error('AI returned malformed content. Please try again.');
    }
    throw err;
  }
}

module.exports = { generateContent };
