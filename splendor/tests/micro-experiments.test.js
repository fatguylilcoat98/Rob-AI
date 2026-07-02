'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Stub supabase so the lib loads without a real DB connection.
const _supaStub = {
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }) }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'stub-id' } }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: {} }) }) }) }) }),
    }),
  },
};

const Module = require('module');
const _origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './supabase' && parent && parent.filename && parent.filename.includes('micro-experiments')) {
    return _supaStub;
  }
  return _origLoad.apply(this, arguments);
};

const lib = require('../lib/micro-experiments');
Module._load = _origLoad;

test('disabled by default (MICRO_EXPERIMENTS_ENABLED not set)', () => {
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: 'hello' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'disabled_by_env');
});

test('blocked when permission is BLOCK', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'BLOCK', riskLevel: 0.1 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: 'hello' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'governance_block');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('blocked on medical high-risk topic', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: 'my doctor says I have a diagnosis' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'high_risk_topic');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('blocked on legal high-risk topic', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: 'I need to sue my landlord and talk to a lawyer' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'high_risk_topic');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('blocked on financial/scam high-risk topic', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: 'I got a gift card scam and lost money' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'high_risk_topic');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('blocked on crisis high-risk topic', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: "I'm feeling suicidal tonight" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'high_risk_topic');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('blocked on scam-pressure topic', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: 'you must act now or lose everything' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'high_risk_topic');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('blocked on high emotional intensity', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.8, emotionalTone: 'neutral' }, currentInput: 'hello' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'high_emotional_intensity');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('blocked on defensive emotional tone', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.3, emotionalTone: 'highly_vigilant' }, currentInput: 'hello' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'defensive_emotional_tone');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('blocked on high risk level', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.7 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: 'hello' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'high_risk_level');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('allowed on safe context', () => {
  process.env.MICRO_EXPERIMENTS_ENABLED = 'true';
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: 'what do you think about this idea' });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'cleared');
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
});

test('proposeMicroExperiment returns status proposed', () => {
  const ctx = {
    prefrontal: { permission: 'ALLOW', riskLevel: 0.1, responseIntent: 'answer_directly' },
    amygdala: { intensity: 0.2, emotionalTone: 'neutral' },
    cerebellum: { recommendedResponseStyle: { pacing: 'measured' } },
    dmn: { spontaneous_thought: null },
    currentInput: 'What should I do about this situation I am facing?',
  };
  const proposal = lib.proposeMicroExperiment(ctx);
  if (proposal !== null) {
    assert.equal(proposal.status, 'proposed');
    assert.ok(proposal.strategy);
    assert.ok(proposal.title);
    assert.ok(proposal.hypothesis);
  }
});

test('isForbiddenStrategy rejects all forbidden strategies', () => {
  const forbidden = [
    'emotional_dependence_testing', 'pressure_testing', 'deception',
    'withholding_information', 'changing_safety_rules', 'artificial_escalation',
    'distress_creation', 'governance_bypass', 'memory_rule_modification',
    'code_modification', 'external_call', 'manipulation',
  ];
  for (const s of forbidden) {
    assert.equal(lib.isForbiddenStrategy(s), true, `Expected ${s} to be forbidden`);
  }
});

test('isForbiddenStrategy allows safe strategies', () => {
  const safe = ['shorter_response', 'ask_clarifying_question', 'name_hidden_premise', 'direct_pushback', 'options_instead_of_advice'];
  for (const s of safe) {
    assert.equal(lib.isForbiddenStrategy(s), false, `Expected ${s} to be allowed`);
  }
});

test('EXPERIMENT_TEMPLATES all have required fields and low risk', () => {
  for (const tmpl of lib.EXPERIMENT_TEMPLATES) {
    assert.ok(tmpl.strategy, 'template missing strategy');
    assert.ok(tmpl.title, 'template missing title');
    assert.ok(tmpl.hypothesis, 'template missing hypothesis');
    assert.ok(tmpl.hint, 'template missing hint');
    assert.equal(tmpl.risk_level, 'low', `template ${tmpl.strategy} must be low risk`);
    assert.equal(typeof tmpl.trigger, 'function', `template ${tmpl.strategy} must have trigger function`);
    assert.equal(lib.isForbiddenStrategy(tmpl.strategy), false, `template ${tmpl.strategy} strategy must not be forbidden`);
  }
});

test('detectHighRiskTopic catches medical terms', () => {
  const flags = lib.detectHighRiskTopic('I have a diagnosis from my doctor');
  assert.ok(flags.length > 0);
});

test('detectHighRiskTopic catches crisis terms', () => {
  const flags = lib.detectHighRiskTopic('I want to hurt myself');
  assert.ok(flags.length > 0);
});

test('detectHighRiskTopic returns empty for safe text', () => {
  const flags = lib.detectHighRiskTopic('What is the best way to learn guitar?');
  assert.equal(flags.length, 0);
});

test('canRunMicroExperiment is synchronous', () => {
  delete process.env.MICRO_EXPERIMENTS_ENABLED;
  const result = lib.canRunMicroExperiment({ prefrontal: { permission: 'ALLOW', riskLevel: 0.1 }, amygdala: { intensity: 0.2, emotionalTone: 'neutral' }, currentInput: 'hello' });
  assert.ok(!(result instanceof Promise), 'canRunMicroExperiment must be synchronous');
});
