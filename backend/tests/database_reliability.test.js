process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectDB, disconnectDB, getDatabaseStatus } from '../src/config/db.js';
import http from 'http';

test('Database Reliability & Connection Visibility Suite', async (t) => {
  const { default: app } = await import('../src/server.js');
  const originalEnv = { ...process.env };

  t.beforeEach(async () => {
    await disconnectDB();
  });

  t.afterEach(async () => {
    // Restore environment and disconnect
    for (const key of Object.keys(process.env)) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    await disconnectDB();
  });

  await t.test('1. Memory fallback permitted in test mode (NODE_ENV=test)', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_MEMORY_DB;
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:59999/unreachable_db?connectTimeoutMS=200';
    process.env.MONGODB_TIMEOUT_MS = '200';

    await connectDB();
    const status = getDatabaseStatus();

    assert.strictEqual(status.connected, true);
    assert.strictEqual(status.isMemory, true);
    assert.strictEqual(status.storageMode, 'IN_MEMORY');
    assert.strictEqual(status.host, 'local-memory');
  });

  await t.test('2. Memory fallback permitted with explicit ALLOW_MEMORY_DB=true in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_MEMORY_DB = 'true';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:59999/unreachable_db?connectTimeoutMS=200';
    process.env.MONGODB_TIMEOUT_MS = '200';

    await connectDB();
    const status = getDatabaseStatus();

    assert.strictEqual(status.connected, true);
    assert.strictEqual(status.isMemory, true);
    assert.strictEqual(status.storageMode, 'IN_MEMORY');
  });

  await t.test('3. Failed Atlas connection in normal development: startup fails and silent fallback is blocked', async () => {
    await disconnectDB();
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_MEMORY_DB;
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:59999/unreachable_db?connectTimeoutMS=200';
    process.env.MONGODB_TIMEOUT_MS = '200';

    await assert.rejects(
      async () => {
        await connectDB();
      },
      (err) => {
        assert.match(err.message, /\[DB FATAL\] External MongoDB connection failed/);
        assert.match(err.message, /Silent in-memory fallback disabled/);
        return true;
      }
    );

    // Verify memory server was NOT started and status is disconnected
    const status = getDatabaseStatus();
    assert.strictEqual(status.connected, false);
    assert.strictEqual(status.isMemory, false);
    assert.strictEqual(status.storageMode, 'DISCONNECTED');
  });

  await t.test('4. Missing MONGODB_URI outside test mode fails clearly without starting memory DB', async () => {
    await disconnectDB();
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_MEMORY_DB;
    delete process.env.MONGODB_URI;

    await assert.rejects(
      async () => {
        await connectDB();
      },
      (err) => {
        assert.match(err.message, /\[DB FATAL\] MONGODB_URI environment variable is required/);
        assert.match(err.message, /ALLOW_MEMORY_DB=true/);
        return true;
      }
    );

    const status = getDatabaseStatus();
    assert.strictEqual(status.connected, false);
    assert.strictEqual(status.isMemory, false);
  });

  await t.test('5. Health response when database is connected', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.MONGODB_URI;
    await connectDB();

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.strictEqual(json.status, 'HEALTHY');
      assert.strictEqual(json.service, 'Enterprise AI Governance Platform API');
      assert.ok(json.timestamp);
      assert.strictEqual(json.database.status, 'CONNECTED');
      assert.strictEqual(json.database.ready, true);
      assert.strictEqual(json.database.isMemory, true);
      assert.strictEqual(json.database.storageMode, 'IN_MEMORY');
    } finally {
      server.close();
    }
  });

  await t.test('6. Health response when database is disconnected returns HTTP 503 and UNHEALTHY', async () => {
    await disconnectDB();

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.strictEqual(res.status, 503);

      const json = await res.json();
      assert.strictEqual(json.status, 'UNHEALTHY');
      assert.strictEqual(json.service, 'Enterprise AI Governance Platform API');
      assert.strictEqual(json.database.status, 'DISCONNECTED');
      assert.strictEqual(json.database.ready, false);
      assert.strictEqual(json.database.storageMode, 'DISCONNECTED');
      assert.strictEqual(json.database.name, null);
    } finally {
      server.close();
    }
  });

  await t.test('7. Safe health response never leaks credentials, passwords, or connection URIs', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.MONGODB_URI;
    await connectDB();

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const rawText = await res.text();

      assert.doesNotMatch(rawText, /mongodb(\+srv)?:\/\//);
      assert.doesNotMatch(rawText, /password|secret|key/i);
      assert.doesNotMatch(rawText, /@/);
    } finally {
      server.close();
    }
  });
});
