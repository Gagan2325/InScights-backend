const axios = require('axios');
const xml2js = require('xml2js');

const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const API_KEY = process.env.PUBMED_API_KEY || '';

// Delay helper to respect NCBI rate limits (max 10 req/sec with key, 3/sec without)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Verify a citation by PMID.
 * Returns enriched citation data or null if not found.
 */
async function verifyByPmid(pmid) {
  try {
    const url = `${PUBMED_BASE}/esummary.fcgi`;
    const params = {
      db: 'pubmed',
      id: pmid,
      retmode: 'json',
      ...(API_KEY && { api_key: API_KEY })
    };

    const response = await axios.get(url, { params, timeout: 8000 });
    const result = response.data?.result;

    if (!result || result.uids?.length === 0) return null;

    const article = result[pmid];
    if (!article || article.error) return null;

    return {
      pmid,
      title: article.title,
      journal: article.source,
      year: article.pubdate?.split(' ')[0],
      authors: article.authors?.slice(0, 3).map(a => a.name).join(', ') + (article.authors?.length > 3 ? ' et al.' : ''),
      doi: article.elocationid || null,
      verified: true,
      pubmed_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    };
  } catch (err) {
    console.warn(`[PubMed] PMID ${pmid} verification failed:`, err.message);
    return null;
  }
}

/**
 * Search PubMed for a citation by title/author/journal keywords.
 * Used when Claude doesn't provide a PMID.
 */
async function searchByKeywords(citation) {
  try {
    const query = buildSearchQuery(citation);
    if (!query) return null;

    const searchUrl = `${PUBMED_BASE}/esearch.fcgi`;
    const searchParams = {
      db: 'pubmed',
      term: query,
      retmax: 3,
      retmode: 'json',
      sort: 'relevance',
      ...(API_KEY && { api_key: API_KEY })
    };

    const searchRes = await axios.get(searchUrl, { params: searchParams, timeout: 8000 });
    const ids = searchRes.data?.esearchresult?.idlist;

    if (!ids || ids.length === 0) return null;

    // Verify the top result
    const verified = await verifyByPmid(ids[0]);
    if (!verified) return null;

    // Fuzzy check: does the year roughly match?
    if (citation.year && Math.abs(parseInt(verified.year) - parseInt(citation.year)) > 2) {
      return null; // Year mismatch — likely different paper
    }

    return { ...verified, pmid: ids[0] };
  } catch (err) {
    console.warn(`[PubMed] Search failed for "${citation.title}":`, err.message);
    return null;
  }
}

/**
 * Build a PubMed search query from citation fields.
 */
function buildSearchQuery(citation) {
  const parts = [];

  if (citation.authors) {
    const firstAuthor = citation.authors.split(' ')[0].replace(',', '');
    if (firstAuthor.length > 2) parts.push(`${firstAuthor}[Author]`);
  }

  if (citation.year) {
    parts.push(`${citation.year}[PDAT]`);
  }

  if (citation.journal) {
    parts.push(`"${citation.journal}"[Journal]`);
  }

  if (citation.title && citation.title.length > 10) {
    // Extract key clinical terms from title (avoid stop words)
    const keyTerms = citation.title
      .split(' ')
      .filter(w => w.length > 5)
      .slice(0, 4)
      .join(' AND ');
    if (keyTerms) parts.push(keyTerms);
  }

  return parts.slice(0, 4).join(' AND ') || null;
}

/**
 * Main verification function.
 * Takes an array of citations from Claude, returns verified/flagged versions.
 */
async function verifyCitations(citations) {
  const results = [];

  for (const citation of citations) {
    await delay(API_KEY ? 120 : 350); // Respect NCBI rate limits

    let verified = null;

    // Strategy 1: Direct PMID lookup (fastest, most reliable)
    if (citation.pmid && citation.pmid !== 'null') {
      console.log(`[PubMed] Verifying PMID: ${citation.pmid}`);
      verified = await verifyByPmid(citation.pmid);
    }

    // Strategy 2: Keyword search (fallback)
    if (!verified) {
      console.log(`[PubMed] Searching for: ${citation.authors} ${citation.year}`);
      verified = await searchByKeywords(citation);
    }

    if (verified) {
      results.push({
        ...citation,
        ...verified,
        verified: true,
        verification_status: 'confirmed'
      });
    } else {
      // Not verified — flag for human review
      results.push({
        ...citation,
        verified: false,
        verification_status: citation.pmid ? 'pmid_not_found' : 'unverified',
        pubmed_url: citation.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${citation.pmid}/` : null
      });
    }
  }

  return results;
}

/**
 * Process all citations across all pairs.
 */
async function verifyAllCitations(pairs) {
  const verifiedPairs = [];

  for (const pair of pairs) {
    // Verify need citations
    const needCitations = await verifyCitations(pair.need?.citations || []);

    // Verify solution citations
    const solutionCitations = await verifyCitations(pair.solution?.citations || []);

    verifiedPairs.push({
      ...pair,
      need: { ...pair.need, citations: needCitations },
      solution: { ...pair.solution, citations: solutionCitations }
    });
  }

  return verifiedPairs;
}

module.exports = { verifyCitations, verifyAllCitations, verifyByPmid };
