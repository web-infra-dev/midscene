import crypto from 'node:crypto';
import type net from 'node:net';

/**
 * Apple Remote Desktop (ARD) authentication handler
 * Security type 30 - used by macOS Screen Sharing
 *
 * Protocol flow:
 * 1. Server sends: generator(2) + keyLength(2) + prime(keyLength) + serverPublicKey(keyLength)
 * 2. Client generates DH keypair using the given prime and generator
 * 3. Client computes shared secret via DH
 * 4. Client derives AES key = MD5(sharedSecret)
 * 5. Client encrypts credentials (username 64 bytes + password 64 bytes) with AES-128-ECB
 * 6. Client sends: clientPublicKey(keyLength) + encryptedCredentials(128 bytes)
 *
 * References:
 * - https://github.com/novnc/noVNC/blob/master/core/ra2.js
 * - https://datatracker.ietf.org/doc/html/rfc6143
 */
export function createArdSecurityType() {
  return {
    getName() {
      return 'Apple Remote Desktop';
    },

    /**
     * Perform ARD authentication handshake
     *
     * Uses the same SocketBuffer read methods as the library's built-in handlers
     * (readUInt16BE, readNBytesOffset) to keep buffer offsets in sync.
     *
     * @param _rfbVer - The negotiated RFB version string
     * @param socket  - SocketBuffer from @computernewb/nodejs-rfb
     * @param connection - The raw TCP socket for writing responses
     * @param auth - Auth credentials object { username, password }
     */
    async authenticate(
      _rfbVer: string,
      socket: any,
      connection: net.Socket,
      auth: any,
    ): Promise<void> {
      console.log('[ARD] authenticate() called, rfbVer=%s', _rfbVer);
      console.log(
        '[ARD] auth object keys: %s, has username: %s, has password: %s',
        auth ? Object.keys(auth).join(',') : 'null',
        !!auth?.username,
        !!auth?.password,
      );

      if (!auth?.username || !auth?.password) {
        throw new Error(
          'Apple Remote Desktop authentication requires both username and password. ' +
            'On macOS, use the system account credentials of the target Mac.',
        );
      }

      try {
        // 1. Read DH parameters from server
        // Use readUInt16BE() — same pattern as the library's built-in handlers
        console.log('[ARD] Step 1: Reading DH params (generator + keyLength)...');
        const generator = await socket.readUInt16BE();
        const keyLength = await socket.readUInt16BE();

        console.log(
          '[ARD] DH params: generator=%d, keyLength=%d',
          generator,
          keyLength,
        );

        if (keyLength <= 0 || keyLength > 1024) {
          throw new Error(`[ARD] Invalid keyLength: ${keyLength}`);
        }

        // Read prime (keyLength bytes) + serverPublicKey (keyLength bytes)
        console.log('[ARD] Step 2: Reading prime (%d bytes)...', keyLength);
        const prime = await socket.readNBytesOffset(keyLength);
        console.log(
          '[ARD] Prime (first 16 bytes): %s',
          Buffer.from(prime).subarray(0, 16).toString('hex'),
        );

        console.log('[ARD] Step 3: Reading server public key (%d bytes)...', keyLength);
        const serverPublicKey = await socket.readNBytesOffset(keyLength);
        console.log(
          '[ARD] Server pubkey (first 16 bytes): %s',
          Buffer.from(serverPublicKey).subarray(0, 16).toString('hex'),
        );

        // 2. Generate DH keypair using server's prime and generator
        console.log('[ARD] Step 4: Generating DH keypair...');
        const dh = crypto.createDiffieHellman(Buffer.from(prime), generator);
        dh.generateKeys();

        // 3. Compute shared secret
        console.log('[ARD] Step 5: Computing shared secret...');
        const sharedSecret = dh.computeSecret(Buffer.from(serverPublicKey));
        console.log(
          '[ARD] Shared secret length: %d, (first 16 bytes): %s',
          sharedSecret.length,
          sharedSecret.subarray(0, 16).toString('hex'),
        );

        // 4. Derive AES-128 key = MD5(sharedSecret)
        const aesKey = crypto.createHash('md5').update(sharedSecret).digest();
        console.log('[ARD] AES key (MD5): %s', aesKey.toString('hex'));

        // 5. Prepare credentials block (128 bytes total)
        // username: 64 bytes, null-padded UTF-8
        // password: 64 bytes, null-padded UTF-8
        const credentials = Buffer.alloc(128);
        const userBytes = Buffer.from(auth.username, 'utf-8');
        const passBytes = Buffer.from(auth.password, 'utf-8');
        userBytes.copy(credentials, 0, 0, Math.min(userBytes.length, 63));
        passBytes.copy(credentials, 64, 0, Math.min(passBytes.length, 63));
        console.log(
          '[ARD] Credentials block: user=%d bytes, pass=%d bytes',
          userBytes.length,
          passBytes.length,
        );

        // 6. Encrypt credentials with AES-128-ECB (no padding, 128 bytes is 8 AES blocks)
        const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null);
        cipher.setAutoPadding(false);
        const encrypted = Buffer.concat([
          cipher.update(credentials),
          cipher.final(),
        ]);
        console.log(
          '[ARD] Encrypted credentials: %d bytes, (first 16): %s',
          encrypted.length,
          encrypted.subarray(0, 16).toString('hex'),
        );

        // 7. Prepare client DH public key (pad/trim to keyLength)
        const clientPublicKey = dh.getPublicKey();
        const clientKeyPadded = Buffer.alloc(keyLength);
        console.log(
          '[ARD] Client pubkey raw length: %d, target keyLength: %d',
          clientPublicKey.length,
          keyLength,
        );

        if (clientPublicKey.length <= keyLength) {
          // Left-pad: copy to the right end of the buffer
          clientPublicKey.copy(
            clientKeyPadded,
            keyLength - clientPublicKey.length,
          );
        } else {
          // Trim from left (take the last keyLength bytes)
          clientPublicKey.copy(
            clientKeyPadded,
            0,
            clientPublicKey.length - keyLength,
          );
        }

        // 8. Send response: clientPublicKey(keyLength) + encryptedCredentials(128)
        const response = Buffer.concat([clientKeyPadded, encrypted]);
        console.log(
          '[ARD] Step 6: Sending response (%d bytes = %d pubkey + %d encrypted)',
          response.length,
          keyLength,
          encrypted.length,
        );
        connection.write(response);

        console.log('[ARD] authenticate() completed successfully, waiting for SecurityResult...');
      } catch (err: any) {
        console.error('[ARD] authenticate() FAILED:', err.message);
        console.error('[ARD] Stack:', err.stack);
        throw err;
      }
    },
  };
}

/** ARD security type number in the RFB protocol */
export const ARD_SECURITY_TYPE = 30;
