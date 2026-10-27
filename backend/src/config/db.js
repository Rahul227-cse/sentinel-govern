import mongoose from 'mongoose';

let mongoMemoryServerInstance = null;

function getDiagnosticErrorInfo(err) {
  const sanitize = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/g, 'mongodb$1://***:***@')
              .replace(/\/\/[^:]+:[^@]+@/g, '//***:***@');
  };

  const lines = [];
  lines.push(`Category: ${err?.name || 'UnknownError'}`);
  if (err?.code !== undefined) {
    lines.push(`Code: ${err.code}`);
  }
  if (err?.message) {
    lines.push(`Message: ${sanitize(err.message)}`);
  }

  const reason = err?.reason || (err?.cause && err.cause.servers ? err.cause : null);
  if (reason) {
    if (reason.type) {
      lines.push(`Topology Type: ${reason.type}`);
    }
    if (reason.servers && typeof reason.servers.entries === 'function') {
      const serverLines = [];
      for (const [address, server] of reason.servers.entries()) {
        const addr = sanitize(address);
        const sType = server?.type || 'Unknown';
        if (server?.error) {
          const errName = server.error.name || 'Error';
          const errMsg = sanitize(server.error.message || '');
          const errCode = server.error.code ? ` [code: ${server.error.code}]` : '';
          const errSyscall = server.error.syscall ? ` [syscall: ${server.error.syscall}]` : '';
          serverLines.push(`  - ${addr} (type: ${sType}) => ${errName}: ${errMsg}${errCode}${errSyscall}`);
        } else {
          serverLines.push(`  - ${addr} (type: ${sType}) => Timed out waiting for initial server handshake (in-flight/unresponsive at 5000ms)`);
        }
      }
      if (serverLines.length > 0) {
        lines.push(`Servers (${serverLines.length} evaluated):`);
        lines.push(...serverLines);
      }
    }
  } else if (err?.cause && err.cause.message) {
    lines.push(`Underlying Cause: ${sanitize(err.cause.message)}`);
  }

  return lines;
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const allowMemoryDb = process.env.ALLOW_MEMORY_DB === 'true';

  if (isProduction) {
    if (!uri) {
      throw new Error('[DB FATAL] MONGODB_URI environment variable is strictly required in production.');
    }
    const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log(`[DB] Connecting to production MongoDB at ${maskedUri}...`);
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS, 10) || 10000 });
      console.log(`[DB] Connected successfully to production MongoDB at ${maskedUri} [database: ${mongoose.connection.name}]`);
      return;
    } catch (err) {
      const diag = getDiagnosticErrorInfo(err);
      console.error(`[DB FATAL] Production MongoDB connection failed: ${err.message}`);
      console.error(`[DB DIAGNOSTIC] Failure details:\n${diag.map(l => `  ${l}`).join('\n')}`);
      throw new Error(`[DB FATAL] Production database connection failed: ${err.message}. Refusing to start server in insecure state.`);
    }
  }

  // Non-production (development / test)
  if (uri && !isTest && !allowMemoryDb) {
    const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    try {
      console.log(`[DB] Attempting connection to MongoDB at ${maskedUri}...`);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS, 10) || 10000 });
      console.log(`[DB] Connected successfully to external MongoDB at ${maskedUri} [database: ${mongoose.connection.name}]`);
      return;
    } catch (err) {
      const diag = getDiagnosticErrorInfo(err);
      console.error(`\n❌ [DB FATAL] External MongoDB connection failed (${err.message}).`);
      console.error(`❌ [DB DIAGNOSTIC] Underlying connection failure breakdown:`);
      for (const line of diag) {
        console.error(`    ${line}`);
      }
      console.error(`❌ [DB FATAL] Silent in-memory database fallback is DISABLED in development.`);
      console.error(`❌ [DB FATAL] Server startup aborted. To explicitly allow an ephemeral database for isolated testing, set ALLOW_MEMORY_DB=true.\n`);
      throw new Error(`[DB FATAL] External MongoDB connection failed: ${err.message}. Silent in-memory fallback disabled.`);
    }
  }

  // If URI is configured in test mode or with explicit ALLOW_MEMORY_DB=true
  if (uri && (isTest || allowMemoryDb)) {
    const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    try {
      console.log(`[DB] Attempting connection to MongoDB at ${maskedUri}...`);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS, 10) || 3000 });
      console.log(`[DB] Connected successfully to external MongoDB at ${maskedUri} [database: ${mongoose.connection.name}]`);
      return;
    } catch (err) {
      console.warn(`[DB WARNING] External MongoDB connection failed in test/memory-allowed mode (${err.message}). Falling back to MongoMemoryServer.`);
    }
  }

  // If no URI is provided outside test mode and memory mode is not explicitly allowed
  if (!uri && !isTest && !allowMemoryDb) {
    const err = new Error('[DB FATAL] MONGODB_URI environment variable is required. To explicitly use an ephemeral in-memory database for local testing, set ALLOW_MEMORY_DB=true.');
    console.error(err.message);
    throw err;
  }

  // Ephemeral Memory database mode (strictly when isTest || allowMemoryDb)
  try {
    console.log(`[DB] Initializing MongoMemoryServer (${isTest ? 'test mode' : 'ALLOW_MEMORY_DB=true'})...`);
    console.warn(`⚠️  [DB NOTICE] Operating in EPHEMERAL IN-MEMORY database mode. Data will NOT persist across server restarts.`);
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoMemoryServerInstance = await MongoMemoryServer.create();
    const memoryUri = mongoMemoryServerInstance.getUri();
    await mongoose.connect(memoryUri);
    console.log(`[DB] Connected successfully to in-memory MongoDB at ${memoryUri}`);
  } catch (memErr) {
    console.error('[DB] Failed to start MongoMemoryServer:', memErr.message);
    throw memErr;
  }
}

export function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;
  const isConnected = readyState === 1;
  const isMemory = Boolean(mongoMemoryServerInstance);
  const databaseName = isConnected ? mongoose.connection.name : null;
  const host = isConnected ? (isMemory ? 'local-memory' : mongoose.connection.host) : null;

  let storageMode = 'DISCONNECTED';
  if (isConnected) {
    storageMode = isMemory ? 'IN_MEMORY' : 'PERSISTENT_ATLAS';
  }

  return {
    connected: isConnected,
    readyState,
    storageMode,
    isMemory,
    databaseName,
    host
  };
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoMemoryServerInstance) {
    try {
      await mongoMemoryServerInstance.stop();
    } catch {}
    mongoMemoryServerInstance = null;
  }
}
