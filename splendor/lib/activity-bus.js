/*
  Splendor — The Remarkable AI
  Activity Bus — in-process pub/sub for live system signals.

  Producers (CLASPION, memory layer, enhanced-chat) call emit().
  Consumers (the /api/activity/stream SSE endpoint) call subscribe().

  Payloads MUST be abstract: no user content, no message text. Only
  decision codes, latency, types — so the SSE channel can stay
  permissively accessible without leaking PII.
*/

const { EventEmitter } = require('events');

class ActivityBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emit(type, payload = {}) {
    const event = {
      type: String(type),
      ts: Date.now(),
      ...payload,
    };
    super.emit('activity', event);
    return event;
  }

  subscribe(listener) {
    this.on('activity', listener);
    return () => this.off('activity', listener);
  }
}

const activityBus = new ActivityBus();

module.exports = { activityBus };
