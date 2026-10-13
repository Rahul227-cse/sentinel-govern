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

  if (isProduction) {
    if (!uri) {
      throw new Error('[DB FATAL] MONGODB_URI environment variable is strictly required in production.');
    }
    const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log(`[DB] Connecting to production MongoDB at ${maskedUri}...`);
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log('[DB] Connected successfully to production MongoDB');
      return;
    } catch (err) {
      const diag = getDiagnosticErrorInfo(err);
      console.error(`[DB FATAL] Production MongoDB connection failed: ${err.message}`);
      console.error(`[DB DIAGNOSTIC] Failure details:\n${diag.map(l => `  ${l}`).join('\n')}`);
      throw new Error(`[DB FATAL] Production database connection failed: ${err.message}. Refusing to start server in insecure state.`);
    }
  }

  if (uri) {
    const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    try {
      console.log(`[DB] Attempting connection to MongoDB at ${maskedUri}...`);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log('[DB] Connected successfully to external MongoDB');
      return;
    } catch (err) {
      const diag = getDiagnosticErrorInfo(err);
      console.warn(`\n⚠️  [DB WARNING] External MongoDB connection failed (${err.message}).`);
      console.warn(`⚠️  [DB DIAGNOSTIC] Underlying connection failure breakdown:`);
      for (const line of diag) {
        console.warn(`    ${line}`);
      }
      console.warn(`⚠️  [DB WARNING] Falling back to ephemeral MongoMemoryServer in non-production mode.`);
      console.warn(`⚠️  [DB WARNING] Data stored in-memory will reset when the server restarts.\n`);
    }
  }

  try {
    console.log('[DB] Initializing MongoMemoryServer for local environment...');
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

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoMemoryServerInstance) {
    await mongoMemoryServerInstance.stop();
  }
}
