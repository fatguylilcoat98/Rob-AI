# Splendor 6-Layer Memory — Foundation (PR A)

> Built by Christopher Hughes · The Good Neighbor Guard · Sacramento, CA
> Truth · Safety · We Got Your Back

This is the **foundation** of the memory build. It's additive: nothing in
existing routes/chat.js or lib/anthropic.js has been modified. The new
modules sit alongside the old ones, ready to be wired in.

---

## What's in this PR

| Layer | Module | Purpose |
|-------|--------|---------|
| 0 | `reality-context.js` | Time, date, timezone, time-since-last-conversation |
| 2 (load) | `episodes.js → loadRecentEpisodes` | Pull last N episodic summaries |
| 4 (load) | `episodes.js → loadCompressedSummaries` | Pull rolling long-term summaries |
| All | `assembler.js → assembleMemoryContext` | Stitch Layers 0/2/3/4 into one prompt block |
| Save | `episodes.js → saveEpisode` | At session end, summarize + store one episode |

**Not included yet (PR B / PR C):**
- Layer 3 update loop (extracting new permanent facts → Pinecone)
- Decay job (daily cron reducing decay_score)
- Compression job (rolling old episodes into a summary paragraph)
- Layer 5 proactive opener
- Session lifecycle (Layer 1 in-memory cap, 30-min inactivity trigger)

---

## Required: run this SQL in Supabase first

Open the Supabase SQL editor and run the bottom block of `database.sql`
(the section labelled `BUILD 4 — 6-LAYER MEMORY SYSTEM`). It creates:

- `episodes`
- `memory_summaries`
- `user_profiles`

…with RLS, indexes, and policies. **Until this runs, every new module
will silently no-op** (we catch errors so the conversation never crashes).

---

## How to wire in (when you're ready)

You don't have to do this in this PR — review first, then wire.

### 1. At chat session start (in `routes/chat.js` POST `/`)

Replace the system-prompt assembly so it prefixes the memory block:

```js
const { assembleMemoryContext } = require('../lib/memory/assembler');

// inside the POST handler, after you've parsed `message` and `userId`:
const memoryContext = await assembleMemoryContext(userId, message);

// then when calling Claude, prepend memoryContext to your system prompt:
const systemPrompt = memoryContext
  ? `${memoryContext}\n\n${SPLENDOR_SOUL}`
  : SPLENDOR_SOUL;
```

### 2. At session end (or every N turns — start simple)

Pick a heuristic that makes sense for your traffic. Easiest first cut:
save an episode after every conversation (one POST = one episode). Later
you can move to a 30-min inactivity timer.

```js
const { saveEpisode } = require('../lib/memory/episodes');
const { touchUserProfile } = require('../lib/memory/reality-context');

// fire-and-forget after responding:
saveEpisode(userId, [
  { role: 'user', content: message },
  { role: 'assistant', content: assistantMessage }
]).then(() => touchUserProfile(userId));
```

`saveEpisode` is fire-and-forget — it logs and returns null on failure
rather than throwing, so it never blocks a reply.

---

## Behavior contract

- **Never crashes a conversation.** Every async call is wrapped in
  try/catch. If Supabase or Pinecone is down, the layer is dropped from
  the assembled context and the chat continues with whatever's left.
- **No flattery, no invented feelings.** The summarization prompt for
  episodes mirrors the soul-document discipline used elsewhere.
- **Privacy-aware.** Reads are scoped to `user_id`; the existing
  per-user memory boundary is preserved.

---

## Test plan (for PR A)

1. Run the SQL block. Confirm `episodes`, `memory_summaries`,
   `user_profiles` exist.
2. From a Node REPL or a one-off script:
   ```js
   const { buildRealityContext } = require('./lib/memory/reality-context');
   buildRealityContext('chris-test').then(console.log);
   ```
   Confirm a well-formed `=== REALITY CONTEXT ===` block appears.
3. Manually insert a test row into `episodes` for your user_id (UUID),
   then call `loadRecentEpisodes('chris-test', 3)` and confirm the row
   comes back.
4. Wire it in (steps above) and confirm replies still work normally.
5. Send a few messages, confirm `episodes` accumulates rows after each
   one.

---

## Next PRs

- **PR B — Episodic + semantic update loop:** new-fact extraction loop
  for Pinecone (Layer 3 write side), session lifecycle (Layer 1 cap +
  30-min inactivity).
- **PR C — Compression + opener:** decay cron, compression job
  (Layer 4 write side), proactive opener (Layer 5).
