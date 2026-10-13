import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AuditLedger } from '../src/models/AuditLedger.js';
import { recordAuditEvent, verifyAuditChainIntegrity } from '../src/services/auditEngine.js';

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('Audit Engine: Concurrent recordAuditEvent calls serialize safely without E11000 duplicate key race', async () => {
  const TOTAL_CONCURRENT = 30;

  // Fire 30 concurrent calls simultaneously
  const promises = [];
  for (let i = 0; i < TOTAL_CONCURRENT; i++) {
    promises.push(
      recordAuditEvent({
        actor: `concurrent-worker-${i % 5}`,
        role: 'ML_LEAD',
        action: 'TELEMETRY_INGESTED',
        entityType: 'Telemetry',
        entityId: `telemetry_${i}`,
        payload: { workerIndex: i, timestamp: Date.now() }
      })
    );
  }

  const results = await Promise.all(promises);
  assert.equal(results.length, TOTAL_CONCURRENT, 'All concurrent audit writes must complete');

  // Query all recorded blocks
  const blocks = await AuditLedger.find().sort({ sequenceNumber: 1 });
  assert.equal(blocks.length, TOTAL_CONCURRENT, 'Total recorded blocks in DB must equal total writes');

  // Verify sequence numbers are strictly 0, 1, 2, ... with no duplicates
  const sequences = blocks.map(b => b.sequenceNumber);
  for (let i = 0; i < TOTAL_CONCURRENT; i++) {
    assert.equal(sequences[i], i, `Sequence at index ${i} must be exactly ${i}`);
  }

  // Verify unique set of sequence numbers
  const uniqueSeqSet = new Set(sequences);
  assert.equal(uniqueSeqSet.size, TOTAL_CONCURRENT, 'All sequence numbers must be strictly unique');

  // Verify complete cryptographic SHA-256 chain integrity
  const integrity = await verifyAuditChainIntegrity();
  assert.equal(integrity.valid, true, 'Cryptographic chain must be valid and unbroken');
  assert.equal(integrity.totalBlocks, TOTAL_CONCURRENT);
  assert.equal(integrity.brokenAtSequence, null);
});
