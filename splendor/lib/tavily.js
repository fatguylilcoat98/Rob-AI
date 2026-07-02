/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { TavilyClient } = require('tavily');

const client = process.env.TAVILY_API_KEY
  ? new TavilyClient({ apiKey: process.env.TAVILY_API_KEY })
  : null;

async function search(query) {
  if (!client) {
    console.log('Tavily not configured — TAVILY_API_KEY missing');
    return null;
  }
  try {
    const response = await client.search(query, {
      searchDepth: 'basic',
      maxResults: 5,
      includeAnswer: true
    });
    return response;
  } catch (err) {
    console.error('Tavily search failed:', err.message);
    return null;
  }
}

module.exports = { search };