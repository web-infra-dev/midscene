import crypto from 'node:crypto';
import type net from 'node:net';
import { getDebug } from '@midscene/shared/logger';

const debug = getDebug('vnc:ard-auth');

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
     * @param _rfbVer - The negotiated RFB version string
     * @param socket  - SocketBuffer from @computernewb/nodejs-rfb (provides waitBytes/flush/buffer)
     * @param connection - The raw TCP socket for writing responses
     * @param auth - Auth credentials object { username, password }
     */
    async authenticate(
      _rfbVer: string,
      socket: any,
      connection: net.Socket,
      auth: any,
    ): Promise<void> {
      if (!auth?.username || !auth?.password) {
        throw new Error(
          'Apple Remote Desktop authentication requires both username and password. ' +
            'On macOS, use the system account credentials of the target Mac.',
        );
      }

      // 1. Read DH parameters from server
      // Header: generator (2 bytes BE) + keyLength (2 bytes BE)
      await socket.waitBytes(4);
      const header = Buffer.from(socket.buffer.subarray(0, 4));
      socket.flush(4);

      const generator = header.readUInt16BE(0);
      const keyLength = header.readUInt16BE(2);

      debug(
        'ARD DH params: generator=%d, keyLength=%d',
        generator,
        keyLength,
      );

      // Prime modulus (keyLength bytes) + server DH public key (keyLength bytes)
      await socket.waitBytes(keyLength * 2);
      const prime = Buffer.from(socket.buffer.subarray(0, keyLength));
      const serverPublicKey = Buffer.from(
        socket.buffer.subarray(keyLength, keyLength * 2),
      );
      socket.flush(keyLength * 2);

      // 2. Generate DH keypair using server's prime and generator
      const dh = crypto.createDiffieHellman(prime, generator);
      dh.generateKeys();

      // 3. Compute shared secret
      const sharedSecret = dh.computeSecret(serverPublicKey);

      // 4. Derive AES-128 key = MD5(sharedSecret)
      const aesKey = crypto.createHash('md5').update(sharedSecret).digest();

      // 5. Prepare credentials block (128 bytes total)
      // username: 64 bytes, null-padded UTF-8
      // password: 64 bytes, null-padded UTF-8
      const credentials = Buffer.alloc(128);
      const userBytes = Buffer.from(auth.username, 'utf-8');
      const passBytes = Buffer.from(auth.password, 'utf-8');
      userBytes.copy(credentials, 0, 0, Math.min(userBytes.length, 63));
      passBytes.copy(credentials, 64, 0, Math.min(passBytes.length, 63));

      // 6. Encrypt credentials with AES-128-ECB (no padding, we pad manually)
      const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null);
      cipher.setAutoPadding(false);
      const encrypted = Buffer.concat([
        cipher.update(credentials),
        cipher.final(),
      ]);

      // 7. Prepare client DH public key (left-pad to keyLength)
      const clientPublicKey = dh.getPublicKey();
      const clientKeyPadded = Buffer.alloc(keyLength);
      // Left-pad: copy to the right end of the buffer
      clientPublicKey.copy(
        clientKeyPadded,
        keyLength - clientPublicKey.length,
      );

      // 8. Send response: clientPublicKey(keyLength) + encryptedCredentials(128)
      const response = Buffer.concat([clientKeyPadded, encrypted]);
      connection.write(response);

      debug('ARD auth response sent (%d bytes)', response.length);
    },
  };
}

/** ARD security type number in the RFB protocol */
export const ARD_SECURITY_TYPE = 30;
