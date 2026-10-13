import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBlockHash } from '../src/services/auditEngine.js';

test('Audit Engine: Computes deterministic SHA-256 block hash', () => {
  const previousHash = '0'.repeat(64);
  const timestamp = new Date('2026-09-11T10:00:00.000Z');
  const actor = 'Dr. Elena Rostova';
  const action = 'MODEL_CREATED';
  const payload = { modelName: 'CreditRisk Underwriting AI', riskLevel: 'HIGH' };

  const hash1 = computeBlockHash(previousHash, timestamp, actor, action, payload);
  const hash2 = computeBlockHash(previousHash, timestamp, actor, action, payload);

  assert.equal(hash1, hash2, 'Hash must be strictly deterministic');
  assert.equal(hash1.length, 64, 'SHA-256 hex string must be 64 characters');
});

test('Audit Engine: Tampering with payload alters computed hash', () => {
  const previousHash = '0'.repeat(64);
  const timestamp = new Date('2026-09-11T10:00:00.000Z');
  const actor = 'Dr. Elena Rostova';
  const action = 'MODEL_CREATED';
  const legitimatePayload = { modelName: 'CreditRisk Underwriting AI', riskLevel: 'HIGH' };
  const tamperedPayload = { modelName: 'CreditRisk Underwriting AI', riskLevel: 'MINIMAL' };

  const originalHash = computeBlockHash(previousHash, timestamp, actor, action, legitimatePayload);
  const tamperedHash = computeBlockHash(previousHash, timestamp, actor, action, tamperedPayload);

  assert.notEqual(originalHash, tamperedHash, 'Tampered payload must produce distinct hash');
});
