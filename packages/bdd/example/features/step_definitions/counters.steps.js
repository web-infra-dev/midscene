const fs = require('node:fs');
const path = require('node:path');
const { defineStep } = require('@midscene/bdd');

defineStep('the login attempt counter increments', async () => {
  // Classic deterministic assertion — no AI involved.
  //
  // POC note: the world API that would let classic callbacks reach the
  // browser (and read window.__loginAttempts directly) is not finalized yet,
  // so this callback performs a deterministic Node-side check instead: it
  // re-reads the server log fixture and asserts the recorded failed-login
  // WARN line is there. A real project would call its own APIs here.
  const logFile = path.join(__dirname, '..', '..', 'server.log');
  const lines = fs.readFileSync(logFile, 'utf8').split('\n');
  const failedLogins = lines.filter(
    (line) => line.includes(' WARN ') && line.includes('failed login attempt'),
  );
  if (failedLogins.length !== 1) {
    throw new Error(
      `expected exactly 1 failed-login WARN line in server.log, found ${failedLogins.length}`,
    );
  }
});
