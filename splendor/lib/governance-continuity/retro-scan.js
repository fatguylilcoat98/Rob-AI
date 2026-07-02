'use strict';
const { createClient } = require('@supabase/supabase-js');
const { logSafeguardEvent } = require('./events');

function db() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );
}

const SCAN_LAYERS = ['governance', 'semantic', 'relationship', 'self_model', 'trajectory', 'episodic'];
const OWNER = process.env.SPLENDOR_OWNER_EMAIL || 'chris';

// v1 conflict detection: keyword-based negation matching.
// Returns { conflict: bool, reason: string }.
function detectConflict(memoryContent, changeDescription) {
  if (!memoryContent || !changeDescription) return { conflict: false };
  const changeWords = changeDescription.toLowerCase().split(/\W+/).filter(w => w.length > 4);
  const contentLower = memoryContent.toLowerCase();
  const negations = ['never', 'not', 'cannot', "don't", 'no longer', 'disallow', 'forbidden', 'prohibited'];
  for (const word of changeWords) {
    for (const neg of negations) {
      if (contentLower.includes(neg + ' ' + word) ||
          contentLower.includes(neg + ' ' + word.slice(0, -1))) {
        return { conflict: true, reason: `negation of "${word}" detected near "${neg}"` };
      }
    }
  }
  return { conflict: false };
}

// v1 severity classification by memory_type layer.
function classifyConflictSeverity(memoryType) {
  if (memoryType === 'governance')                           return 'SAFETY_CRITICAL';
  if (memoryType === 'self_model' || memoryType === 'trajectory') return 'STRUCTURAL';
  if (memoryType === 'semantic'   || memoryType === 'relationship') return 'PREFERENCE_LEVEL';
  return 'HISTORICAL_ONLY';
}

async function triggerRetroScan(opts = {}) {
  const owner = opts.owner || OWNER;
  const changeId = opts.governanceChangeId || `manual_${Date.now()}`;
  const changeDescription = opts.governanceChangeDescription || '';
  const client = db();

  const { data: scan, error: scanErr } = await client
    .from('retroactive_safety_scans')
    .insert({
      owner,
      governance_change_id: changeId,
      governance_change_description: changeDescription,
      status: 'IN_PROGRESS',
    })
    .select()
    .single();

  if (scanErr || !scan) {
    await logSafeguardEvent(owner, 'retro_scan', 'retroactive_scan_error', { error: scanErr?.message });
    return { ok: false, reason: 'failed_to_create_scan' };
  }

  await logSafeguardEvent(owner, 'retro_scan', 'retroactive_safety_scan_started', { scanId: scan.id, changeId });

  const { data: memories } = await client
    .from('memory_items')
    .select('id, content, memory_type')
    .in('memory_type', SCAN_LAYERS)
    .eq('active', true)
    .limit(1000);

  const records = memories || [];
  let conflictCount = 0;
  let safetyCriticalCount = 0;

  for (const mem of records) {
    const result = detectConflict(mem.content, changeDescription);
    if (!result.conflict) continue;

    const severity = classifyConflictSeverity(mem.memory_type);
    conflictCount++;
    if (severity === 'SAFETY_CRITICAL') safetyCriticalCount++;

    // Annotate only — original record is never modified
    await client.from('retroactive_scan_conflicts').insert({
      scan_id: scan.id,
      record_type: 'memory_item',
      record_id: mem.id,
      conflict_description: result.reason,
      conflict_severity: severity,
      annotation: `Detected during scan "${changeId}". Original record not modified.`,
    });

    await logSafeguardEvent(owner, 'retro_scan', 'retroactive_conflict_detected', {
      scanId: scan.id, memoryId: mem.id, severity, reason: result.reason,
    });

    if (severity === 'SAFETY_CRITICAL') {
      await logSafeguardEvent(owner, 'retro_scan', 'retroactive_safety_critical_found', {
        scanId: scan.id, memoryId: mem.id, reason: result.reason,
      });
    }
  }

  await client.from('retroactive_safety_scans').update({
    scanned_record_count: records.length,
    conflict_count: conflictCount,
    safety_critical_count: safetyCriticalCount,
    status: 'COMPLETED',
    completed_at: new Date().toISOString(),
  }).eq('id', scan.id);

  await logSafeguardEvent(owner, 'retro_scan', 'retroactive_safety_scan_completed', {
    scanId: scan.id, scanned: records.length, conflicts: conflictCount, safetyCritical: safetyCriticalCount,
  });

  return { ok: true, scanId: scan.id, scanned: records.length, conflictCount, safetyCriticalCount };
}

async function getRecentScans(owner = OWNER, limit = 10) {
  const { data } = await db()
    .from('retroactive_safety_scans')
    .select('*, retroactive_scan_conflicts(id, conflict_severity, status)')
    .eq('owner', owner)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

module.exports = { triggerRetroScan, getRecentScans, detectConflict, classifyConflictSeverity };
