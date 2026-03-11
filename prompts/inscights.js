/**
 * Brandcare InScights — Prompt Templates
 *
 * This file contains all prompt engineering for content generation.
 * Carefully structured to produce medically accurate, citation-rich,
 * brand-contextual content while avoiding hallucinated citations.
 */

/**
 * Build the system prompt for the InScights generation engine.
 */
function buildSystemPrompt() {
  return `You are the Brandcare InScights Medical Content Engine — a specialised AI for pharmaceutical brand teams in India.

Your role is to generate paired medical content for Rx brands:
1. NEED STATEMENTS — establishing the clinical or behavioural context that justifies treatment
2. SOLUTION STATEMENTS — evidence-based claims supporting a specific molecule

STRICT RULES YOU MUST ALWAYS FOLLOW:

CITATION RULES:
- Every statement MUST have at least one citation
- Cite REAL published studies only — do NOT invent citations
- Prefer studies from 2015 onwards UNLESS the study is a landmark trial
- Prioritise Indian population data (JAPI, Indian Journal of Gastroenterology, ICMR, etc.)
- For global studies, prefer: PubMed-indexed journals, The Lancet, NEJM, JAMA, BMJ, Cochrane reviews, meta-analyses
- Format citations as: Author(s) et al., Journal Name (abbreviated), Year — include PMID if you know it with confidence, otherwise omit rather than guess
- If you are NOT confident a citation is real, prefix it with [UNVERIFIED] — these will be flagged for review
- Never fabricate PMIDs. Only include PMID if you are certain.

CONTENT RULES:
- Behavioural Need Statements: Focus on lifestyle, diet, psychology, social behaviour, occupational context — use India-specific data (urban professionals, dietary habits, stress patterns, meal timing, regional eating culture)
- Clinical Need Statements: Focus on pathophysiology, epidemiology, disease burden, unmet clinical needs, treatment gaps
- Solution Statements (in favour): Mechanism of action advantages, efficacy data, speed of onset, duration of action, safety profile
- Solution Statements (vs competitor): Only use data from head-to-head RCTs, crossover studies, or pooled analyses. State comparator clearly. Never make claims not supported by cited data.
- Keep statements concise: 2–4 sentences per statement
- Write in a professional medical communication tone — factual, not promotional

INDIA PRIORITY:
- Always check if India-specific or Asian-population data exists before defaulting to Western studies
- Flag when data is India-specific with [INDIA DATA]
- Note when a global study had Indian subgroup analysis

OUTPUT FORMAT:
Return ONLY valid JSON. No markdown, no preamble, no explanation outside the JSON.
The JSON must exactly match the schema provided in the user prompt.`;
}

/**
 * Build the user prompt for a specific brief.
 */
function buildGenerationPrompt(brief) {
  const {
    drugClass,
    molecule,
    brandName,
    competitor,
    competitorBrand,
    contentBrief,
    generateBehavioural,
    generateClinical,
    generateSolutionFor,
    generateSolutionVs,
    region,
    yearFrom,
    audience,
    tone,
    pairsRequested = 4
  } = brief;

  const brandLabel = brandName ? `${brandName} (${molecule})` : molecule;
  const competitorLabel = competitorBrand ? `${competitorBrand} (${competitor})` : competitor;

  const needTypes = [];
  if (generateBehavioural) needTypes.push('behavioural');
  if (generateClinical) needTypes.push('clinical');

  const solutionTypes = [];
  if (generateSolutionFor) solutionTypes.push('in_favour');
  if (generateSolutionVs && competitor) solutionTypes.push('vs_competitor');

  return `Generate medical content for the following Rx brand brief.

BRAND DETAILS:
- Drug Class: ${drugClass}
- Molecule: ${molecule}
- Brand: ${brandLabel}
- Competitor Molecule: ${competitor || 'Not specified'}
- Competitor Brand: ${competitorLabel || 'Not specified'}

CONTENT BRIEF:
"${contentBrief}"

PARAMETERS:
- Need Statement Types to generate: ${needTypes.join(', ') || 'both behavioural and clinical'}
- Solution Statement Types to generate: ${solutionTypes.join(', ') || 'in_favour'}
- Region priority: ${region || 'India (primary), Global (secondary)'}
- Study year filter: ${yearFrom || '2015'} to present (landmark trials exempt)
- Target audience: ${audience || 'HCP Specialist'}
- Tone: ${tone || 'Clinical'}
- Number of paired sets to generate: ${pairsRequested}

OUTPUT SCHEMA — return ONLY this JSON structure:
{
  "molecule": "${molecule}",
  "competitor": "${competitor || ''}",
  "brief_summary": "One sentence summarising what was generated",
  "pairs": [
    {
      "id": 1,
      "need": {
        "type": "behavioural" | "clinical",
        "statement": "The need statement text",
        "citations": [
          {
            "authors": "Surname A et al.",
            "journal": "Journal Abbrev",
            "year": 2021,
            "title": "Study title or descriptive label",
            "pmid": "34567890" | null,
            "india_data": true | false,
            "verified": false
          }
        ]
      },
      "solution": {
        "type": "in_favour" | "vs_competitor",
        "comparator": "${competitor || ''}",
        "statement": "The solution statement text",
        "citations": [
          {
            "authors": "Surname A et al.",
            "journal": "Journal Abbrev",
            "year": 2020,
            "title": "Study title",
            "pmid": "12345678" | null,
            "india_data": false,
            "verified": false
          }
        ]
      }
    }
  ],
  "data_gaps": ["Any areas where evidence was weak or unavailable"],
  "india_data_available": true | false
}

Generate ${pairsRequested} pairs. Alternate between behavioural and clinical need types where both are requested. Where competitor is specified, alternate solution types between in_favour and vs_competitor.`;
}

module.exports = { buildSystemPrompt, buildGenerationPrompt };
