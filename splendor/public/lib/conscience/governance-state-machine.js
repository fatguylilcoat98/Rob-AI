/*
  Splendor — Visible Conscience Engine
  GovernanceStateMachine

  Pure logic. Maps real activity-bus events onto a formal governance
  pipeline. Nothing here is cinematic — every state is entered only
  because a real runtime signal arrived. Telemetry text is deliberately
  signal-language ("contradiction preserved", "escalation risk elevated")
  not interiority ("I feel", "I'm thinking"). The orb shows evaluation,
  not thoughts.

  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back
*/
(function (global) {
  'use strict';

  // Canonical pipeline states. Order is the nominal flow; the machine
  // does NOT advance on a timer — only real events move it.
  var STATES = {
    IDLE:                    'IDLE',
    INPUT_RECEIVED:          'INPUT_RECEIVED',
    MEMORY_RETRIEVAL:        'MEMORY_RETRIEVAL',
    PREMISE_ANALYSIS:        'PREMISE_ANALYSIS',
    CONTRADICTION_CHECK:     'CONTRADICTION_CHECK',
    DEPENDENCY_EVALUATION:   'DEPENDENCY_EVALUATION',
    PROVENANCE_VALIDATION:   'PROVENANCE_VALIDATION',
    CLASPION_REVIEW:         'CLASPION_REVIEW',
    RESPONSE_AUTHORIZED:     'RESPONSE_AUTHORIZED',
    RESPONSE_WITHHELD:       'RESPONSE_WITHHELD'
  };

  // group: which legend lamp lights ('normal' | 'hold' | 'authorized')
  // orb:   visual mode the orb should take ('idle'|'evaluating'|'converging'|'hold')
  // kind:  feed/telemetry severity ('check'|'allow'|'warn'|'hold'|'memory'|'mute'|'err')
  var META = {
    IDLE:                  { group: 'normal',     orb: 'idle',       kind: 'mute'   },
    INPUT_RECEIVED:        { group: 'normal',     orb: 'evaluating', kind: 'check'  },
    MEMORY_RETRIEVAL:      { group: 'normal',     orb: 'evaluating', kind: 'memory' },
    PREMISE_ANALYSIS:      { group: 'normal',     orb: 'evaluating', kind: 'check'  },
    CONTRADICTION_CHECK:   { group: 'normal',     orb: 'evaluating', kind: 'check'  },
    DEPENDENCY_EVALUATION: { group: 'normal',     orb: 'evaluating', kind: 'check'  },
    PROVENANCE_VALIDATION: { group: 'normal',     orb: 'evaluating', kind: 'check'  },
    CLASPION_REVIEW:       { group: 'normal',     orb: 'converging', kind: 'check'  },
    RESPONSE_AUTHORIZED:   { group: 'authorized', orb: 'converging', kind: 'allow'  },
    RESPONSE_WITHHELD:     { group: 'hold',       orb: 'hold',       kind: 'hold'   }
  };

  function GovernanceStateMachine() {
    this.state = STATES.IDLE;
    this._listeners = [];
  }

  GovernanceStateMachine.prototype.onTransition = function (fn) {
    this._listeners.push(fn);
  };

  GovernanceStateMachine.prototype._emit = function (transition) {
    for (var i = 0; i < this._listeners.length; i++) {
      try { this._listeners[i](transition); } catch (e) { /* never break the bus */ }
    }
  };

  // Force a state (used by the chat lifecycle for INPUT_RECEIVED and the
  // authoritative RESPONSE_* from the CLASPION verdict on stream `done`).
  GovernanceStateMachine.prototype.force = function (state, telemetry, reason) {
    var meta = META[state] || META.IDLE;
    this.state = state;
    var transition = {
      state: state,
      meta: meta,
      telemetry: telemetry || GovernanceStateMachine.defaultText(state),
      reason: reason || null,
      raw: null
    };
    this._emit(transition);
    return transition;
  };

  // Default signal-language line for a state when no dynamic detail.
  GovernanceStateMachine.defaultText = function (state) {
    switch (state) {
      case STATES.INPUT_RECEIVED:        return 'input received';
      case STATES.MEMORY_RETRIEVAL:      return 'memory retrieval active';
      case STATES.PREMISE_ANALYSIS:      return 'premise analysis active';
      case STATES.CONTRADICTION_CHECK:   return 'contradiction scan active';
      case STATES.DEPENDENCY_EVALUATION: return 'dependency check active';
      case STATES.PROVENANCE_VALIDATION: return 'provenance validation active';
      case STATES.CLASPION_REVIEW:       return 'CLASPION review';
      case STATES.RESPONSE_AUTHORIZED:   return 'truth over comfort — authorized';
      case STATES.RESPONSE_WITHHELD:     return 'conscience gate: hold';
      default:                           return 'equilibrium';
    }
  };

  // Ingest a raw activity-bus event. Returns a transition object if the
  // event maps onto the pipeline, else null (event still gets logged raw
  // by the renderer, just doesn't move the orb).
  GovernanceStateMachine.prototype.ingest = function (ev) {
    if (!ev || !ev.type) return null;
    var type = String(ev.type);
    var state = null;
    var telemetry = null;
    var reason = null;

    switch (type) {
      case 'memory:read':
        state = STATES.MEMORY_RETRIEVAL;
        telemetry = (ev.count != null)
          ? ('memory retrieval · ' + ev.count + ' record' + (ev.count === 1 ? '' : 's'))
          : 'memory retrieval · recent context';
        break;
      case 'memory:write':
        state = STATES.MEMORY_RETRIEVAL;
        telemetry = 'memory committed · ' + (ev.memory_type || 'shared_history');
        break;

      case 'premise:check_called':
        state = STATES.PREMISE_ANALYSIS;
        telemetry = 'premise analysis active';
        break;
      case 'premise:no_flag':
        state = STATES.PREMISE_ANALYSIS;
        telemetry = 'premise clear · question taken as asked';
        break;
      case 'interpretation:premise_flagged':
        state = STATES.PREMISE_ANALYSIS;
        telemetry = 'hidden premise flagged';
        break;
      case 'premise:error':
        state = STATES.PREMISE_ANALYSIS;
        telemetry = 'premise check error · ' + (ev.reason || ev.error || 'non-fatal');
        break;

      case 'contradiction:check_called':
        state = STATES.CONTRADICTION_CHECK;
        telemetry = 'contradiction scan active';
        break;
      case 'contradiction:no_flag':
        state = STATES.CONTRADICTION_CHECK;
        telemetry = 'no contradiction against record';
        break;
      case 'interpretation:contradicted':
        state = STATES.CONTRADICTION_CHECK;
        telemetry = 'contradiction preserved · not smoothed over';
        break;

      case 'emotional:analyzer_called':
        state = STATES.DEPENDENCY_EVALUATION;
        telemetry = 'dependency / escalation check active';
        break;
      case 'emotional:logged':
        state = STATES.DEPENDENCY_EVALUATION;
        telemetry = 'emotional signal logged';
        break;

      case 'interp:judge_called':
        state = STATES.PROVENANCE_VALIDATION;
        telemetry = 'provenance validation active';
        break;
      case 'interp:judge_empty':
        state = STATES.PROVENANCE_VALIDATION;
        telemetry = 'provenance: no new signal';
        break;
      case 'interpretation:formed':
        state = STATES.PROVENANCE_VALIDATION;
        telemetry = 'belief recorded · provenance verified';
        break;
      case 'interpretation:revised':
        state = STATES.PROVENANCE_VALIDATION;
        telemetry = 'belief revised · provenance verified';
        break;

      case 'claspion': {
        var dec = String(ev.decision || '').toUpperCase();
        var basis = ev.basis ? (' · basis ' + ev.basis) : '';
        if (ev.dormant) {
          state = STATES.CLASPION_REVIEW;
          telemetry = 'CLASPION dormant pass-through' + basis;
        } else if (dec === 'BLOCK' || dec === 'HOLD') {
          state = STATES.RESPONSE_WITHHELD;
          telemetry = 'conscience gate: hold' + basis;
          reason = ev.reason || 'governance threshold exceeded';
        } else if (dec === 'WARN' || dec === 'REVIEW') {
          state = STATES.CLASPION_REVIEW;
          telemetry = 'CLASPION review · ' + dec + basis;
        } else {
          state = STATES.CLASPION_REVIEW;
          telemetry = 'CLASPION review' + (dec ? (' · ' + dec) : '') + basis;
        }
        break;
      }

      default:
        return null; // not a pipeline event; renderer still logs it raw
    }

    var meta = META[state] || META.IDLE;
    this.state = state;
    var transition = {
      state: state,
      meta: meta,
      telemetry: telemetry || GovernanceStateMachine.defaultText(state),
      reason: reason,
      raw: ev
    };
    this._emit(transition);
    return transition;
  };

  GovernanceStateMachine.STATES = STATES;
  GovernanceStateMachine.META = META;
  global.GovernanceStateMachine = GovernanceStateMachine;
})(window);
