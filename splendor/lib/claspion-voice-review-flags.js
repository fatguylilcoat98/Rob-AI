'use strict';

/*
  CLASPION Voice/Review Feature Flags — Splendor experimental

  Both flags default false. No production behavior changes unless
  explicitly enabled via environment variables.

  CLASPION_VOICE_ENABLED=true        — enables explanation mode + decision store
  CLASPION_REVIEW_MODE_ENABLED=true  — enables reclassification/review mode
*/

const CLASPION_VOICE_ENABLED =
  (process.env.CLASPION_VOICE_ENABLED || '').toLowerCase() === 'true';

const CLASPION_REVIEW_MODE_ENABLED =
  (process.env.CLASPION_REVIEW_MODE_ENABLED || '').toLowerCase() === 'true';

module.exports = { CLASPION_VOICE_ENABLED, CLASPION_REVIEW_MODE_ENABLED };
