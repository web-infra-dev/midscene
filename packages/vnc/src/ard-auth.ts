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
 * 5. Client encrypts credentials { username[64], password[64] } with AES-128-ECB
 * 6. Client sends: encryptedCredentials(128) + clientPublicKey(keyLength)
 *
 * References:
 * - https://cafbit.com/post/apple_remote_desktop_quirks/
 * - https://github.com/novnc/noVNC/blob/master/core/ra2.js
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
          '[ARD] Shared secret raw length: %d, keyLength: %d',
          sharedSecret.length,
          keyLength,
        );

        // Pad shared secret to keyLength bytes (left-pad with zeros) if shorter
        // This ensures consistent MD5 hash regardless of DH output length
        let paddedSecret = sharedSecret;
        if (sharedSecret.length < keyLength) {
          paddedSecret = Buffer.alloc(keyLength);
          sharedSecret.copy(paddedSecret, keyLength - sharedSecret.length);
          console.log('[ARD] Shared secret padded from %d to %d bytes', sharedSecret.length, keyLength);
        }

        // 4. Derive AES-128 key = MD5(sharedSecret)
        const aesKey = crypto.createHash('md5').update(paddedSecret).digest();
        console.log('[ARD] AES key (MD5): %s', aesKey.toString('hex'));

        // 5. Prepare credentials block (128 bytes total)
        // { username[64], password[64] } — null-terminated, random-padded
        // Per Apple ARD spec: fill unused bytes with random data
        const credentials = crypto.randomBytes(128);
        const userBytes = Buffer.from(auth.username, 'utf-8');
        const passBytes = Buffer.from(auth.password, 'utf-8');
        // Write username (null-terminated) into first 64 bytes
        userBytes.copy(credentials, 0, 0, Math.min(userBytes.length, 63));
        credentials[Math.min(userBytes.length, 63)] = 0; // null terminator
        // Write password (null-terminated) into bytes 64-127
        passBytes.copy(credentials, 64, 0, Math.min(passBytes.length, 63));
        credentials[64 + Math.min(passBytes.length, 63)] = 0; // null terminator
        console.log(
          '[ARD] Credentials block: user=%d bytes, pass=%d bytes (random-padded)',
          userBytes.length,
          passBytes.length,
        );

        // 6. Encrypt credentials with AES-128-ECB (no padding, 128 bytes = 8 AES blocks)
        const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null);
        cipher.setAutoPadding(false);
        const encrypted = Buffer.concat([
          cipher.update(credentials),
          cipher.final(),
        ]);
        console.log(
          '[ARD] Encrypted credentials: %d bytes',
          encrypted.length,
        );

        // 7. Prepare client DH public key (pad/trim to keyLength)
        const clientPublicKey = dh.getPublicKey();
        const clientKeyPadded = Buffer.alloc(keyLength);

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

        // 8. Send response: encryptedCredentials(128) + clientPublicKey(keyLength)
        // Per Apple ARD spec (cafbit.com): ciphertext first, then DH public key
        const response = Buffer.concat([encrypted, clientKeyPadded]);
        console.log(
          '[ARD] Step 6: Sending response (%d bytes = %d encrypted + %d pubkey)',
          response.length,
          encrypted.length,
          keyLength,
        );
        connection.write(response);

        console.log('[ARD] authenticate() completed, waiting for SecurityResult...');
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
