'use strict';
const { createClient } = require('@supabase/supabase-js');

function db() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );
}

async function logSafeguardEvent(owner, safeguard, eventType, details = {}) {
  const { error } = await db().from('governance_continuity_events').insert({
    owner: owner || null,
    safeguard,
    event_type: eventType,
    details,
  });
  if (error) console.error('[gc:events]', eventType, error.message);
}

module.exports = { logSafeguardEvent };
