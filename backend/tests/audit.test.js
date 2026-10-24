import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditLedger } from '../src/models/AuditLedger.js';
import {
  computeBlockHash,
  recordAuditEvent,
  verifyAuditChainIntegrity
} from '../src/services/auditEngine.js';

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

test('Audit Engine Regression: Prevents deadlock when ordinary write arrives between transactional writes', async () => {
  const committedDocs = [];
  const txDocs = [];

  const origFindOne = AuditLedger.findOne;
  const origCreate = AuditLedger.create;
  const origFind = AuditLedger.find;

  // Simulate MongoDB Read-Committed isolation
  AuditLedger.findOne = () => {
    let currentSession = null;
    const query = {
      sort: () => query,
      session: (sess) => {
        currentSession = sess;
        return query;
      },
      then: (resolve) => {
        const visible = currentSession ? [...committedDocs, ...txDocs] : [...committedDocs];
        const last = visible.length > 0 ? visible[visible.length - 1] : null;
        return resolve(last);
      }
    };
    return query;
  };

  AuditLedger.create = async (docOrArray, options = {}) => {
    const isSessionWrite = Boolean(options?.session);
    if (isSessionWrite) {
      const doc = Array.isArray(docOrArray) ? docOrArray[0] : docOrArray;
      txDocs.push(doc);
      return [doc];
    }
    const doc = Array.isArray(docOrArray) ? docOrArray[0] : docOrArray;
    committedDocs.push(doc);
    return doc;
  };

  AuditLedger.find = () => {
    let currentSession = null;
    const query = {
      sort: () => query,
      session: (sess) => {
        currentSession = sess;
        return query;
      },
      then: (resolve) => {
        const visible = currentSession ? [...committedDocs, ...txDocs] : [...committedDocs];
        return resolve(visible);
      }
    };
    return query;
  };

  const session = {
    commitTransaction: async () => {
      while (txDocs.length > 0) {
        committedDocs.push(txDocs.shift());
      }
    },
    abortTransaction: async () => {
      txDocs.length = 0;
    },
    endSession: async () => {}
  };

  try {
    // 1. Transaction appends its first audit event
    const txWrite1 = await recordAuditEvent({
      actor: 'tx-worker',
      role: 'SYSTEM',
      action: 'MODEL_CREATED',
      entityType: 'Model',
      entityId: 'model_1',
      payload: { name: 'Credit Risk Scoring' },
      session
    });
    assert.equal(txWrite1.sequenceNumber, 0, 'First transaction write gets sequence 0');

    // 2. An ordinary audit write arrives before the transaction commits
    let ordinaryCompleted = false;
    const ordinaryPromise = recordAuditEvent({
      actor: 'ordinary-telemetry-scheduler',
      role: 'SYSTEM',
      action: 'TELEMETRY_INGESTED',
      entityType: 'Telemetry',
      entityId: 'telemetry_batch_1',
      payload: { sampleSize: 25 }
    }).then(res => {
      ordinaryCompleted = true;
      return res;
    });

    // Verify ordinary write does NOT complete prematurely or block the queue
    await new Promise(r => setTimeout(r, 25));
    assert.equal(ordinaryCompleted, false, 'Ordinary write must wait for active transaction to commit');

    // 3. The transaction appends a second audit event and commits
    const txWrite2 = await recordAuditEvent({
      actor: 'tx-worker',
      role: 'SYSTEM',
      action: 'VERSION_CREATED',
      entityType: 'ModelVersion',
      entityId: 'version_1',
      payload: { version: 'v1.0' },
      session
    });
    assert.equal(txWrite2.sequenceNumber, 1, 'Second transaction write gets sequence 1 without deadlocking');

    // Commit the transaction
    await session.commitTransaction();

    // 4. Await ordinary write completion
    const ordinaryWrite = await ordinaryPromise;
    assert.equal(ordinaryCompleted, true, 'Ordinary write finishes promptly after transaction commits');
    assert.equal(ordinaryWrite.sequenceNumber, 2, 'Ordinary write gets sequence 2 after committed transaction');

    // 5. Verify total records, order, and cryptographic chain integrity
    assert.equal(committedDocs.length, 3);
    assert.equal(committedDocs[0].sequenceNumber, 0);
    assert.equal(committedDocs[1].sequenceNumber, 1);
    assert.equal(committedDocs[2].sequenceNumber, 2);

    assert.equal(committedDocs[1].previousHash, committedDocs[0].currentHash);
    assert.equal(committedDocs[2].previousHash, committedDocs[1].currentHash);

    const chainStatus = await verifyAuditChainIntegrity();
    assert.equal(chainStatus.valid, true, 'Cryptographic chain must be valid and unbroken');
    assert.equal(chainStatus.totalBlocks, 3);
    assert.equal(chainStatus.brokenAtSequence, null);
  } finally {
    AuditLedger.findOne = origFindOne;
    AuditLedger.create = origCreate;
    AuditLedger.find = origFind;
  }
});
