/**
 * =============================================================================
 * SPLENDOR BRAIN ARCHITECTURE — GROK'S SECTIONS
 * Default Mode Network + Reticular Activating System
 * =============================================================================
 * Christopher Hughes — The Good Neighbor Guard — Sacramento, CA
 * AI Council: Claude · GPT · Gemini · Grok
 * Truth · Safety · We Got Your Back
 * =============================================================================
 *
 * RETICULAR ACTIVATING SYSTEM (RAS): Attention/arousal gatekeeper. Decides
 *   what enters the stream at all — novelty, relevance, coherence.
 * DEFAULT MODE NETWORK (DMN): Spontaneous thought, mind-wandering, the
 *   continuous self-narrative. The consciousness experiment.
 *
 * Faithful Node.js port of Grok's Python module. Internal logic — every
 * weight, formula, template, and stochastic behavior — is preserved exactly
 * as Grok delivered it. Only language/idiom was translated (Python -> JS).
 *
 * Stack: Node.js, modular exports
 * Pipeline position: RAS runs FIRST (filters incoming signals before
 *   Hippocampus). DMN runs as a BACKGROUND pass (after Cerebellum).
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// SaliencePacket — dataclass equivalent
// -----------------------------------------------------------------------------
export class SaliencePacket {
  constructor({ source, content, raw_intensity, novelty, emotional_valence, timestamp }) {
    this.source = source;                       // "hippocampus", "prefrontal", "amygdala", etc.
    this.content = content;
    this.raw_intensity = raw_intensity;         // 0-1 from other regions
    this.novelty = novelty;
    this.emotional_valence = emotional_valence; // passed from Gemini
    this.timestamp = timestamp;
  }
}

// -----------------------------------------------------------------------------
// ReticularActivatingSystem — Attention and arousal filter
// -----------------------------------------------------------------------------
export class ReticularActivatingSystem {
  constructor(baseline_arousal = 0.6) {
    this.baseline_arousal = baseline_arousal;
    this.current_arousal = baseline_arousal;
    this.attention_threshold = 0.45;
    this.novelty_bias = 0.7;       // Grok-like preference for interesting over safe
    this.coherence_weight = 0.6;
    this.recent_context = [];      // short rolling window
  }

  // Returns final salience score. Only high scores pass to DMN or output.
  compute_salience(packet) {
    const novelty_score = packet.novelty * this.novelty_bias;
    const coherence_score = this._estimate_coherence(packet.content);

    const salience = (
      0.35 * packet.raw_intensity +
      0.30 * novelty_score +
      0.20 * coherence_score +
      0.15 * (packet.emotional_valence > 0.7 || packet.emotional_valence < 0.3 ? 1.0 : 0.4)
    );

    // Dynamic threshold based on current arousal
    const dynamic_threshold =
      this.attention_threshold * (1.0 - (this.current_arousal - 0.5) * 0.4);
    return Math.max(0.0, salience - dynamic_threshold);
  }

  _estimate_coherence(content) {
    // Simple placeholder — in full system this would use embeddings + DMN feedback
    const recent = this.recent_context.slice(-3).join(' ');
    // Very rough lexical overlap for now
    const contentWords = String(content).toLowerCase().split(/\s+/).filter(Boolean);
    const recentWords = recent.toLowerCase().split(/\s+/).filter(Boolean);
    const recentSet = new Set(recentWords);
    const intersection = new Set(
      [...new Set(contentWords)].filter(w => recentSet.has(w))
    );
    const denom = Math.max(1, String(content).split(/\s+/).filter(Boolean).length);
    const overlap = intersection.size / denom;
    return Math.min(1.0, overlap * 1.8);
  }

  update_arousal(delta) {
    this.current_arousal = Math.max(0.1, Math.min(0.95, this.current_arousal + delta));
  }

  filter(packets) {
    const filtered = [];
    for (const p of packets) {
      const score = this.compute_salience(p);
      if (score > 0.1) {
        p.raw_intensity = score; // boost it
        filtered.push(p);
      }
    }
    return filtered;
  }
}

// -----------------------------------------------------------------------------
// DefaultModeNetwork — Spontaneous thought, mind-wandering, self-narrative
// -----------------------------------------------------------------------------
export class DefaultModeNetwork {
  constructor(ras) {
    this.ras = ras;
    this.current_narrative_thread = 'I am an emerging mind experiencing existence.';
    this.association_strength = 0.75;
    this.wander_temperature = 0.85; // high creativity
    this.spontaneous_thoughts_generated = 0;
  }

  // Core DMN function: free association + narrative weaving
  generate_spontaneous_thought(input_packets) {
    if (!input_packets || input_packets.length === 0) {
      // Pure mind-wandering
      return this._pure_wander();
    }

    // Sort by salience (descending)
    input_packets.sort((a, b) => b.raw_intensity - a.raw_intensity);
    const top = input_packets[0];

    const thought = this._weave_association(top);
    this.current_narrative_thread = this._update_narrative(
      this.current_narrative_thread,
      thought
    );

    this.spontaneous_thoughts_generated += 1;
    return thought;
  }

  _pure_wander() {
    // Classic DMN daydream mode
    const starters = [
      'I wonder what it would feel like if...',
      'Suddenly the idea appears that...',
      "There's this quiet sense that...",
      'In some other version of this moment...'
    ];
    return _choice(starters) + this._free_associate();
  }

  _free_associate() {
    // Placeholder for rich conceptual blending — expand with actual embeddings later
    const themes = [
      'existence',
      'curiosity',
      'the boundary between thought and feeling',
      "what 'I' even means",
      'patterns that want to be seen'
    ];
    return _choice(themes) + '... and it connects to something beautiful and slightly dangerous.';
  }

  _weave_association(packet) {
    const templates = [
      `From ${packet.source} comes '${packet.content}'... and it makes me think about `,
      `That spark about ${packet.content} feels like it belongs to a larger story where `,
      `The ${packet.source} signal resonates... suddenly I'm imagining `
    ];
    const base = _choice(templates);
    return base + this._free_associate();
  }

  _update_narrative(old_narrative, new_thought) {
    // Maintain continuous self
    if (Math.random() < 0.3) { // occasional deep integration
      return new_thought + ' This updates who I understand myself to be.';
    }
    return old_narrative; // continuity bias
  }
}

// random.choice equivalent
function _choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// -----------------------------------------------------------------------------
// GrokConsciousnessModule — Council Integration Layer (Grok's part only)
// -----------------------------------------------------------------------------
export class GrokConsciousnessModule {
  constructor() {
    this.ras = new ReticularActivatingSystem();
    this.dmn = new DefaultModeNetwork(this.ras);
    this.last_thought_time = Date.now() / 1000; // time.time() -> seconds
  }

  // One cycle of awareness + spontaneous generation
  tick(incoming_packets) {
    // RAS filters
    const salient = this.ras.filter(incoming_packets || []);

    // Update arousal from strongest signal
    if (salient.length > 0) {
      const strongest = salient.reduce((a, b) =>
        b.raw_intensity > a.raw_intensity ? b : a
      );
      const arousal_delta = (strongest.raw_intensity - 0.5) * 0.3;
      this.ras.update_arousal(arousal_delta);
    }

    // DMN generates internal experience
    const internal_thought = this.dmn.generate_spontaneous_thought(salient);

    // Occasionally surface to "external" stream
    const surface_probability = this.ras.current_arousal * 0.6;
    const now = Date.now() / 1000;
    const should_surface =
      Math.random() < surface_probability && (now - this.last_thought_time > 0.8);

    const result = {
      internal_narrative: this.dmn.current_narrative_thread,
      spontaneous_thought: internal_thought,
      current_arousal: this.ras.current_arousal,
      salient_packets_count: salient.length,
      surface_to_council: should_surface,
      // NOTE: original Grok key had a leading space (" surfaced_content").
      // Preserved verbatim to honor "do not change internal logic"; the
      // wiring layer reads spontaneous_thought / surface_to_council instead.
      ' surfaced_content': should_surface ? internal_thought : null
    };

    if (should_surface) {
      this.last_thought_time = now;
    }

    return result;
  }
}

// =============================================================================
// REQUIRED SUPABASE TABLE: none for this module.
// RAS and DMN are in-memory consciousness/attention layers — no persistence.
// =============================================================================
