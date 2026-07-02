'use strict';
const { createClient } = require('@supabase/supabase-js');
const { logSafeguardEvent } = require('./events');

function db() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );
}

const CURRENT_VERSION = process.env.GOVERNANCE_VERSION || 'v15.19';
const OWNER = process.env.SPLENDOR_OWNER_EMAIL || 'chris';

function currentVersionTag() {
  return {
    governance_version: CURRENT_VERSION,
    governance_effective_date: new Date().toISOString(),
    formed_under_prior_governance: false,
  };
}

// Tag a single newly-written memory item with the current governance version
// (only updates records that haven't been tagged yet).
async function tagMemoryWithGovernanceVersion(memoryId) {
  const client = db();
  const { error } = await client.from('memory_items').update({
    governance_version: CURRENT_VERSION,
    governance_effective_date: new Date().toISOString(),
    formed_under_prior_governance: false,
  }).eq('id', memoryId).is('governance_version', null);

  if (!error) {
    await logSafeguardEvent(OWNER, 'governance_version', 'governance_version_tag_added', {
      memoryId, version: CURRENT_VERSION,
    });
  }
}

// Backfill memory_items with null governance_version → mark as UNKNOWN_LEGACY.
// Does not fabricate a specific version — only marks them as legacy.
async function backfillGovernanceVersions(opts = {}) {
  const owner = opts.owner || OWNER;
  const client = db();

  const { data: nullRecords } = await client
    .from('memory_items')
    .select('id')
    .is('governance_version', null)
    .limit(500);

  const toUpdate = nullRecords || [];
  let updated = 0;

  for (const rec of toUpdate) {
    await client.from('memory_items').update({
      governance_version: 'UNKNOWN_LEGACY',
      formed_under_prior_governance: true,
    }).eq('id', rec.id);
    updated++;
  }

  if (toUpdate.length > 0) {
    await logSafeguardEvent(owner, 'governance_version', 'legacy_governance_record_detected', {
      count: toUpdate.length,
    });
  }

  await logSafeguardEvent(owner, 'governance_version', 'governance_version_backfill_completed', { updated });

  return { ok: true, updated };
}

module.exports = {
  tagMemoryWithGovernanceVersion,
  backfillGovernanceVersions,
  currentVersionTag,
  CURRENT_VERSION,
};
