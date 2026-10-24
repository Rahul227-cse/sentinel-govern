import crypto from 'crypto';
import { AuditLedger } from '../models/AuditLedger.js';

const GENESIS_PREVIOUS_HASH = '0'.repeat(64);

export function computeBlockHash(previousHash, timestamp, actor, action, payload) {
  const canonicalPayload = JSON.stringify(payload || {}, Object.keys(payload || {}).sort());
  const serialized = `${previousHash}|${new Date(timestamp).toISOString()}|${actor}|${action}|${canonicalPayload}`;
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

let auditWriteQueue = Promise.resolve();

// Active transactional sessions with uncommitted audit writes.
// Map<ClientSession, { promise: Promise<void>, resolve: Function }>
const activeTxSessions = new Map();
const kHooksInstalled = Symbol('auditEngineHooksInstalled');

function trackTxSession(session) {
  if (!session) return;

  if (!activeTxSessions.has(session)) {
    let resolveSession;
    const sessionPromise = new Promise((resolve) => {
      resolveSession = resolve;
    });
    activeTxSessions.set(session, { promise: sessionPromise, resolve: resolveSession });
  }

  if (session[kHooksInstalled]) {
    return;
  }
  session[kHooksInstalled] = true;

  const cleanup = () => {
    const entry = activeTxSessions.get(session);
    if (entry) {
      activeTxSessions.delete(session);
      entry.resolve();
    }
  };

  const origCommit = typeof session.commitTransaction === 'function' ? session.commitTransaction.bind(session) : null;
  const origAbort = typeof session.abortTransaction === 'function' ? session.abortTransaction.bind(session) : null;
  const origEnd = typeof session.endSession === 'function' ? session.endSession.bind(session) : null;

  if (origCommit) {
    session.commitTransaction = async function (...args) {
      try {
        return await origCommit(...args);
      } finally {
        cleanup();
      }
    };
  }

  if (origAbort) {
    session.abortTransaction = async function (...args) {
      try {
        return await origAbort(...args);
      } finally {
        cleanup();
      }
    };
  }

  if (origEnd) {
    session.endSession = async function (...args) {
      try {
        return await origEnd(...args);
      } finally {
        cleanup();
      }
    };
  }
}

async function waitForOtherActiveTransactions(currentSession = null) {
  while (true) {
    const otherPromises = [];
    for (const [sess, entry] of activeTxSessions.entries()) {
      if (sess !== currentSession) {
        otherPromises.push(entry.promise);
      }
    }
    if (otherPromises.length === 0) {
      break;
    }
    await Promise.allSettled(otherPromises);
  }
}

async function _recordAuditEventWithRetry({ actor, role = 'SYSTEM', action, entityType, entityId, payload = {}, session = null }, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const query = AuditLedger.findOne().sort({ sequenceNumber: -1 });
      if (session) {
        query.session(session);
      }
      const lastRecord = await query;

      const sequenceNumber = lastRecord ? lastRecord.sequenceNumber + 1 : 0;
      const previousHash = lastRecord ? lastRecord.currentHash : GENESIS_PREVIOUS_HASH;
      const timestamp = new Date();

      const currentHash = computeBlockHash(previousHash, timestamp, actor, action, payload);

      const docData = {
        sequenceNumber,
        previousHash,
        currentHash,
        timestamp,
        actor,
        role,
        action,
        entityType,
        entityId: String(entityId),
        payload
      };

      let auditEntry;
      if (session) {
        const createdDocs = await AuditLedger.create([docData], { session });
        auditEntry = createdDocs[0];
      } else {
        auditEntry = await AuditLedger.create(docData);
      }

      return auditEntry;
    } catch (error) {
      const isDuplicateKey = error.code === 11000 ||
        (error.name === 'MongoServerError' && error.code === 11000) ||
        (error.message && (error.message.includes('E11000') || error.message.includes('duplicate key')));

      // In a multi-document transaction, an E11000 or write error aborts the transaction.
      // Statement-level retries on the same session will fail with "transaction aborted",
      // so only retry if we are NOT inside a transactional session.
      if (!session && isDuplicateKey && attempt < maxRetries - 1) {
        const delayMs = 15 * Math.pow(2, attempt) + Math.floor(Math.random() * 20);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      console.error('[AuditEngine] Failed to record audit event:', error.message);
      throw error;
    }
  }
}

export async function recordAuditEvent({ actor, role = 'SYSTEM', action, entityType, entityId, payload = {}, session = null }) {
  if (session) {
    trackTxSession(session);
  }

  // Ordinary writes (or writes from another transaction) wait for any in-flight
  // uncommitted transactional session to resolve BEFORE entering the database write queue.
  // This prevents non-transactional writes from reading uncommitted sequence numbers,
  // blocking on index locks, and starving transaction-scoped audit writes.
  await waitForOtherActiveTransactions(session);

  const executeOperation = () => _recordAuditEventWithRetry({ actor, role, action, entityType, entityId, payload, session });

  const queuedPromise = auditWriteQueue.then(executeOperation, executeOperation);
  auditWriteQueue = queuedPromise.catch(() => {});
  return queuedPromise;
}

export async function verifyAuditChainIntegrity({ session = null } = {}) {
  const query = AuditLedger.find().sort({ sequenceNumber: 1 });
  if (session) {
    query.session(session);
  }
  const records = await query;

  if (!records || records.length === 0) {
    return {
      valid: true,
      totalBlocks: 0,
      brokenAtSequence: null,
      message: 'Audit ledger is empty'
    };
  }

  for (let i = 0; i < records.length; i++) {
    const block = records[i];

    // Check previous hash linkage
    if (i === 0) {
      if (block.previousHash !== GENESIS_PREVIOUS_HASH) {
        return {
          valid: false,
          totalBlocks: records.length,
          brokenAtSequence: 0,
          message: 'Genesis block has invalid previousHash'
        };
      }
    } else {
      const prevBlock = records[i - 1];
      if (block.previousHash !== prevBlock.currentHash) {
        return {
          valid: false,
          totalBlocks: records.length,
          brokenAtSequence: block.sequenceNumber,
          message: `Hash link broken between block ${prevBlock.sequenceNumber} and ${block.sequenceNumber}`
        };
      }
    }

    // Check recalculation of current block's hash
    const recalculatedHash = computeBlockHash(
      block.previousHash,
      block.timestamp,
      block.actor,
      block.action,
      block.payload
    );

    if (recalculatedHash !== block.currentHash) {
      return {
        valid: false,
        totalBlocks: records.length,
        brokenAtSequence: block.sequenceNumber,
        message: `Block ${block.sequenceNumber} payload or header has been tampered with. Expected: ${block.currentHash}, Calculated: ${recalculatedHash}`
      };
    }
  }

  return {
    valid: true,
    totalBlocks: records.length,
    brokenAtSequence: null,
    message: 'Cryptographic chain verified. All blocks authentic and unaltered.'
  };
}

// Tamper simulation helper for demonstration and test verification
export async function simulateTamperOnBlock(sequenceNumber, tamperedPayload) {
  const block = await AuditLedger.findOne({ sequenceNumber });
  if (!block) {
    throw new Error(`Block at sequence ${sequenceNumber} not found`);
  }

  block.payload = tamperedPayload;
  // Intentionally saving without updating currentHash to break the chain
  await block.save();
  return block;
}

// Restore / Re-seal cryptographic chain after tamper demonstration
export async function repairAuditChain() {
  const records = await AuditLedger.find().sort({ sequenceNumber: 1 });
  let prevHash = GENESIS_PREVIOUS_HASH;
  for (let i = 0; i < records.length; i++) {
    const block = records[i];
    block.previousHash = prevHash;
    block.currentHash = computeBlockHash(prevHash, block.timestamp, block.actor, block.action, block.payload);
    await block.save();
    prevHash = block.currentHash;
  }
  return { success: true, count: records.length };
}
