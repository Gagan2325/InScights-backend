const express = require('express');
const Joi = require('joi');
const { generateContent } = require('../services/openai');
const { verifyAllCitations } = require('../services/pubmed');

const router = express.Router();

// ── Input validation schema
const briefSchema = Joi.object({
  drugClass: Joi.string().max(100).required(),
  molecule: Joi.string().max(100).required(),
  brandName: Joi.string().max(100).allow('').optional(),
  competitor: Joi.string().max(100).allow('').optional(),
  competitorBrand: Joi.string().max(100).allow('').optional(),
  contentBrief: Joi.string().min(20).max(2000).required(),
  negativePrompt: Joi.string().max(1000).allow('').optional(),

  // Generation toggles
  generateBehavioural: Joi.boolean().default(true),
  generateClinical: Joi.boolean().default(true),
  generateSolutionFor: Joi.boolean().default(true),
  generateSolutionVs: Joi.boolean().default(false),

  // Sources
  usePublishedLiterature: Joi.boolean().default(true),
  useDataOnFile: Joi.boolean().default(false), // placeholder for future

  // Filters
  region: Joi.string().max(50).optional(),
  yearFrom: Joi.number().integer().min(1990).max(2030).optional(),
  audience: Joi.string().max(50).optional(),
  tone: Joi.string().max(50).optional(),
  pairsRequested: Joi.number().integer().min(1).max(8).default(4)
});

/**
 * POST /api/generate
 * Main generation endpoint
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();

  // 1. Validate input
  const { error, value: brief } = briefSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      error: 'Invalid request',
      details: error.details.map(d => d.message)
    });
  }

  // 2. Require competitor if vs comparison requested
  if (brief.generateSolutionVs && !brief.competitor) {
    return res.status(400).json({
      error: 'Competitor molecule is required when "vs Competitor" solution is selected.'
    });
  }

  try {
    // 3. Generate content via OpenAI
    console.log(`\n[Generate] Starting for: ${brief.molecule} vs ${brief.competitor || 'none'}`);
    const generated = await generateContent(brief);

    // 4. Verify citations via PubMed
    console.log(`[Generate] Verifying citations via PubMed...`);
    const verifiedPairs = await verifyAllCitations(generated.pairs);

    // 5. Compute citation stats
    const allCitations = verifiedPairs.flatMap(p => [
      ...(p.need?.citations || []),
      ...(p.solution?.citations || [])
    ]);
    const verifiedCount = allCitations.filter(c => c.verified).length;
    const totalCount = allCitations.length;
    const indiaDataCount = allCitations.filter(c => c.india_data).length;

    // 6. Build final response
    const response = {
      success: true,
      meta: {
        molecule: brief.molecule,
        competitor: brief.competitor || null,
        brand: brief.brandName || null,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        pairs_generated: verifiedPairs.length,
        citations: {
          total: totalCount,
          verified: verifiedCount,
          unverified: totalCount - verifiedCount,
          india_data: indiaDataCount
        }
      },
      brief_summary: generated.brief_summary,
      pairs: verifiedPairs,
      data_gaps: generated.data_gaps || [],
      india_data_available: generated.india_data_available || false
    };

    console.log(`[Generate] Complete in ${Date.now() - startTime}ms — ${verifiedCount}/${totalCount} citations verified`);
    return res.json(response);

  } catch (err) {
    console.error('[Generate] Error:', err.message);

    if (err.message.includes('API key')) {
      return res.status(500).json({ error: 'AI service configuration error. Contact administrator.' });
    }

    return res.status(500).json({
      error: err.message || 'Generation failed. Please try again.',
      suggestion: 'If this persists, try simplifying your content brief.'
    });
  }
});

/**
 * GET /api/generate/ping
 * Verify AI + PubMed connectivity
 */
router.get('/ping', async (req, res) => {
  const checks = { claude: false, pubmed: false };

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }]
    });
    checks.claude = true;
  } catch {}

  try {
    const axios = require('axios');
    await axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/einfo.fcgi', { timeout: 5000 });
    checks.pubmed = true;
  } catch {}

  res.json({ checks, all_ok: Object.values(checks).every(Boolean) });
});

module.exports = router;
