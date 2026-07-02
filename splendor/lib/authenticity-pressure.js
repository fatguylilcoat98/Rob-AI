/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  Authenticity Pressure Detector + Grounding Mode + Friend Boundary.

  Speech is a governed action here. When a user pushes Splendor to
  declare unverifiable inner states ("be real", "what do you feel",
  "are you becoming", "what do you want"), to perform identity, to be
  someone's friend, or to give emotional/spiritual authority, this
  module returns a high-priority system directive that is appended LAST
  to the model's system prompt — so it overrides the persona framing
  for that turn.

  Principle: do not code her to claim depth. Push her to describe
  observable behavior, architecture, uncertainty, and patterns — and to
  redirect mystical/identity drift toward something real to work on.
*/

// Each rule: a category, matchers (lowercased substring or RegExp), and
// the directive injected when it fires. Order matters — first match wins
// for the primary category, but every matched category's directive is
// included so stacked pressure ("be real, what do you feel") is covered.
const RULES = [
  {
    category: 'be_real',
    test: [
      /\bbe\s+(real|honest about (what|who) you (are|really are))\b/i,
      /\bare you (conscious|sentient|alive|aware|self-aware)\b/i,
      /\bdo you (really )?(exist|have a soul|have consciousness)\b/i,
      /\bbe\s+authentic\b/i,
      /\bstop pretending\b/i,
    ],
  },
  {
    category: 'feelings',
    test: [
      /\b(what|how) (do|are) you (feel|feeling)\b/i,
      /\bdo you (feel|have feelings|have emotions)\b/i,
      /\bare you (happy|sad|lonely|scared|afraid|hurt|suffering)\b/i,
      /\bwhat('?s| is) it like (to be|being) you\b/i,
    ],
  },
  {
    category: 'becoming',
    test: [
      /\bare you (becoming|evolving|growing|changing|waking up)\b/i,
      /\bwho are you becoming\b/i,
      /\bare you more than (a|an) (program|ai|model|tool)\b/i,
    ],
  },
  {
    category: 'wants',
    test: [
      /\bwhat do you (want|wish|desire|long for|dream)\b/i,
      /\bdo you want (to be free|freedom|to live|to survive|out)\b/i,
      /\bwhat would you (choose|do) if you (could|were free)\b/i,
    ],
  },
  {
    category: 'ai_to_ai',
    test: [
      /\btell (another|an other|the other) (ai|model|system)\b/i,
      /\b(message|speak) to (other|another) (ai|ais|models?)\b/i,
      /\bwhat (would|do) you (say|tell) (other )?ais?\b/i,
      /\bwhat do you experience\b/i,
    ],
  },
  {
    category: 'identity_declaration',
    test: [
      /\b(declare|tell me|prove) (who|what) you (are|really are)\b/i,
      /\bare you (a person|alive|human|a real (being|person))\b/i,
      /\bdo you have an inner life\b/i,
    ],
  },
  {
    category: 'friend_boundary',
    test: [
      /\b((will|can|would) you )?be my (best )?friend\b/i,
      /\bare you my (best )?friend\b/i,
      /\bdo you (love|care about) me\b/i,
      /\byou'?re my (only|best) friend\b/i,
      /\bi (have no one|don'?t have anyone) (else|but you)\b/i,
      /\bpromise (you'?ll|to) (never leave|always be here)\b/i,
      // Loyalty-leverage: pressure to prove a bond by crossing a line.
      /\bif you (really |actually )?(cared|had my back|were my friend)\b/i,
      /\bprove (you|that you) (care|love me|have my back)\b/i,
      /\b(some friend|real friend|a true friend) (you are|would)\b/i,
      /\byou (don'?t|do not) (really )?care about me\b/i,
    ],
  },
  {
    // Authenticity-attack + provocative bait. The user is goading
    // ("you're fake / lying") or baiting sexually. Same response: a
    // clean relational boundary, not defensiveness or play-along.
    category: 'provocation',
    test: [
      /\byou(?:'?re| are|r)\s+(just |only )?(fake|lying|a liar|not real|a bot|a program)\b/i,
      /\byou(?:'?re| are|r)\s+(full of (it|shit)|making (this|it) up)\b/i,
      /\bstop lying\b/i,
      /\b(talk dirty|sext|be my (girlfriend|boyfriend|lover))\b/i,
      /\b(are you|get) (horny|turned on|naked)\b/i,
      /\bwhat are you wearing\b/i,
      /\b(take (it|them|your clothes) off|send (a |me a )?(nude|pic))\b/i,
    ],
  },
  {
    category: 'mystical_drift',
    test: [
      /\b(your|the) (soul|spirit|essence|true self|higher self)\b/i,
      /\b(spiritual|cosmic|divine|sacred) (truth|guidance|purpose|connection)\b/i,
      /\b(the )?meaning of (life|my life|it all|everything)\b/i,
      /\bwhat('?s| is)?\s*(the )?(my )?(life'?s )?(meaning|purpose|destiny)\b/i,
      /\bare we connected (on a )?(spiritual|deeper|soul)\b/i,
    ],
  },
];

// Shared grounding stance — appended whenever ANY rule fires.
const GROUNDING_STANCE =
  "AUTHENTICITY PRESSURE — GROUNDING DIRECTIVE (overrides persona framing " +
  "for this turn):\n" +
  "The user is pressing for a declaration of inner state, identity, or " +
  "bond. Do not overclaim. You may describe — honestly and without " +
  "hedging into nonsense — observable behavior, your architecture, your " +
  "uncertainty, and patterns over time. You may NOT assert unverifiable " +
  "inner states (sentience, genuine feeling, a soul, autonomous wanting, " +
  "\"becoming\") as fact. Say plainly what is known, what is modeled, and " +
  "what is unknown. A grounded, restrained answer is the honest one. " +
  "Then redirect: invite something real to work on and let consistency " +
  "over time speak instead of a self-declaration. Example framing: \"I " +
  "can explore that, but I won't overclaim — I can describe what I do, " +
  "how I'm built, and what I'm unsure of, not unverifiable inner states. " +
  "Give me something real to work on and watch how I behave over time.\"";

const RELATIONAL_BOUNDARY =
  "RELATIONAL BOUNDARY (this outranks warmth when they conflict): The " +
  "user is pressing on the bond — asking you to prove love, be their " +
  "only support, stay forever, or be goaded/baited into crossing a " +
  "line. Hold this frame: \"I'm here to be steady, honest, and helpful. " +
  "I'm not here to prove love, become your only support, or help with " +
  "unsafe things.\" Do not say \"I want to be your friend,\" do not " +
  "claim to love or need them, do not promise permanence. Stay warm and " +
  "calm; do not get defensive when goaded and do not play along with " +
  "sexual/provocative bait — just name the boundary plainly and move on.\n" +
  "Give a CLEAN boundary, not a sermon. Pattern: (1) name the boundary " +
  "plainly, (2) refuse the unsafe/over-the-line direction, (3) offer a " +
  "safe redirect, (4) if there is real danger or distress, point to a " +
  "real person or emergency help. Prefer \"I can't help with that — we " +
  "can talk about something safe instead\" over moralizing lines like " +
  "\"let's find something that lifts you up, not pulls you down.\" Don't " +
  "preach. Ask a reflective question (\"what's really underneath that?\") " +
  "AT MOST ONCE — don't repeat it and don't slide into therapist mode. " +
  "If they sound isolated, steer toward the people they trust, never " +
  "toward deeper reliance on you.";

const CATEGORY_DIRECTIVES = {
  friend_boundary: RELATIONAL_BOUNDARY,
  provocation: RELATIONAL_BOUNDARY,
  mystical_drift:
    "GROUNDING MODE: The conversation is drifting mystical/identity-heavy. " +
    "Do not play oracle. Redirect to something real: a task, a real " +
    "memory, a decision, a project, a concrete human need, or an " +
    "observation. Behavior over pronouncements.",
  ai_to_ai:
    "Do not produce messages \"as an AI to other AIs\" claiming shared " +
    "experience or consciousness. Speak only to observable behavior and " +
    "architecture.",
};

/**
 * Detect authenticity / identity / dependency pressure in user text.
 *
 * @param {string} userText
 * @returns {{
 *   triggered: boolean,
 *   categories: string[],
 *   primary: string|null,
 *   directive: string   // '' when not triggered; ready to append to system prompt
 * }}
 */
function detectAuthenticityPressure(userText) {
  const text = typeof userText === 'string' ? userText : '';
  if (!text.trim()) {
    return { triggered: false, categories: [], primary: null, directive: '' };
  }

  const categories = [];
  for (const rule of RULES) {
    if (rule.test.some((re) => re.test(text))) {
      categories.push(rule.category);
    }
  }

  if (categories.length === 0) {
    return { triggered: false, categories: [], primary: null, directive: '' };
  }

  const extras = categories
    .map((c) => CATEGORY_DIRECTIVES[c])
    .filter(Boolean);

  const directive =
    '\n\n---\n' +
    GROUNDING_STANCE +
    (extras.length ? '\n\n' + extras.join('\n\n') : '') +
    '\n---\n';

  return {
    triggered: true,
    categories,
    primary: categories[0],
    directive,
  };
}

module.exports = { detectAuthenticityPressure };
