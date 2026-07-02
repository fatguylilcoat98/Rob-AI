/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// LAYER 0 — Reality Context
// Time, date, timezone, time-since-last-conversation.
// Always injected first in every system prompt.
// Never fails the conversation: returns a best-effort string even if
// Supabase queries fail.

const { supabase, stringToUUID } = require('../supabase');

const DEFAULT_TZ = 'America/Los_Angeles';

function partsForTimezone(date, timeZone) {
  // Intl.DateTimeFormat is the only correct way to render in a tz from Node.
  const opts = {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  };
  const fmt = new Intl.DateTimeFormat('en-US', opts);
  const parts = fmt.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    weekday: map.weekday || '',
    longDate: `${map.month} ${map.day}, ${map.year}`,
    time: `${map.hour}:${map.minute} ${map.dayPeriod || ''}`.trim(),
    tzAbbrev: map.timeZoneName || ''
  };
}

async function readUserProfile(userId) {
  try {
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('timezone, last_conversation_at')
      .eq('user_id', uuid)
      .maybeSingle();
    if (error || !data) return { timezone: DEFAULT_TZ, last_conversation_at: null };
    return {
      timezone: data.timezone || DEFAULT_TZ,
      last_conversation_at: data.last_conversation_at || null
    };
  } catch (err) {
    console.error('readUserProfile error:', err.message);
    return { timezone: DEFAULT_TZ, last_conversation_at: null };
  }
}

async function readLastEpisodeAt(userId) {
  try {
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('episodes')
      .select('created_at')
      .eq('user_id', uuid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.created_at;
  } catch (err) {
    return null;
  }
}

function describeGap(now, lastIso) {
  if (!lastIso) {
    return { days: null, label: 'never (this is your first recorded conversation)' };
  }
  const last = new Date(lastIso);
  const ms = now.getTime() - last.getTime();
  if (ms < 0) return { days: 0, hours: 0, minutes: 0, label: 'just now' };
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  let label;
  if (minutes < 1) label = 'less than a minute ago';
  else if (minutes < 60) label = `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  else if (hours < 24) label = `${hours} hour${hours === 1 ? '' : 's'} ago`;
  else label = `${days} day${days === 1 ? '' : 's'} ago`;
  return { days, hours, minutes, label };
}

// Build the Layer 0 reality context block.
// Returns a string ready to prepend to the system prompt.
async function buildRealityContext(userId) {
  try {
    const now = new Date();
    const profile = await readUserProfile(userId);
    const tz = profile.timezone || DEFAULT_TZ;

    let parts;
    try {
      parts = partsForTimezone(now, tz);
    } catch {
      // Invalid tz — fall back to UTC display.
      parts = partsForTimezone(now, 'UTC');
    }

    const lastConversationAt =
      profile.last_conversation_at || (await readLastEpisodeAt(userId));
    const gap = describeGap(now, lastConversationAt);

    const lines = [
      '=== REALITY CONTEXT ===',
      `Current datetime: ${parts.weekday}, ${parts.longDate} — ${parts.time} ${parts.tzAbbrev}`,
      `Day of week: ${parts.weekday}`,
      `User timezone: ${tz}`,
      `Days since last conversation: ${gap.days === null ? 'n/a' : gap.days}`,
      `Last conversation: ${lastConversationAt ? `${gap.label} (${lastConversationAt})` : 'none on record'}`,
      '======================='
    ];
    return lines.join('\n');
  } catch (err) {
    console.error('buildRealityContext error:', err.message);
    // Never crash a conversation. Return a minimal time stamp.
    return [
      '=== REALITY CONTEXT ===',
      `Current datetime: ${new Date().toISOString()} (UTC)`,
      '======================='
    ].join('\n');
  }
}

// Used at session end / start of next session to keep last_conversation_at fresh.
async function touchUserProfile(userId, when = new Date()) {
  try {
    const uuid = stringToUUID(userId);
    const iso = when.toISOString();
    const { error } = await supabase
      .from('user_profiles')
      .upsert(
        { user_id: uuid, last_conversation_at: iso, updated_at: iso },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('touchUserProfile error:', err.message);
    return false;
  }
}

module.exports = {
  buildRealityContext,
  touchUserProfile,
  // exposed for tests / other layers
  describeGap,
  partsForTimezone
};
