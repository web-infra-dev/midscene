import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ARD_SECURITY_TYPE, createArdSecurityType } from '../../src/ard-auth';

describe('ARD authentication (type 30)', () => {
  it('should have correct security type number', () => {
    expect(ARD_SECURITY_TYPE).toBe(30);
  });

  it('should return correct name', () => {
    const handler = createArdSecurityType();
    expect(handler.getName()).toBe('Apple Remote Desktop');
  });

  it('should reject when username is missing', async () => {
    const handler = createArdSecurityType();
    const mockSocket = { waitBytes: vi.fn(), buffer: Buffer.alloc(0), flush: vi.fn() };
    const mockConn = { write: vi.fn() } as any;

    await expect(
      handler.authenticate('3.8', mockSocket, mockConn, { password: 'pass' }),
    ).rejects.toThrow('username and password');
  });

  it('should reject when password is missing', async () => {
    const handler = createArdSecurityType();
    const mockSocket = { waitBytes: vi.fn(), buffer: Buffer.alloc(0), flush: vi.fn() };
    const mockConn = { write: vi.fn() } as any;

    await expect(
      handler.authenticate('3.8', mockSocket, mockConn, { username: 'user' }),
    ).rejects.toThrow('username and password');
  });

  it('should complete DH handshake and send encrypted credentials', async () => {
    const handler = createArdSecurityType();

    // Simulate a server-side DH: generate a known prime and keypair
    const keyLength = 128; // 1024-bit DH (128 bytes)
    const generator = 2;
    const serverDH = crypto.createDiffieHellman(keyLength * 8); // bits
    serverDH.generateKeys();

    const prime = serverDH.getPrime();
    const serverPublicKey = serverDH.getPublicKey();

    // Pad prime and public key to exactly keyLength bytes (left-pad)
    const primePadded = Buffer.alloc(keyLength);
    prime.copy(primePadded, keyLength - prime.length);

    const serverPubPadded = Buffer.alloc(keyLength);
    serverPublicKey.copy(serverPubPadded, keyLength - serverPublicKey.length);

    // Build the full server data stream (what comes after security type selection):
    // generator(2 BE) + keyLength(2 BE) + prime(keyLength) + serverPubKey(keyLength)
    const serverData = Buffer.concat([
      Buffer.from([
        (generator >> 8) & 0xff,
        generator & 0xff,
        (keyLength >> 8) & 0xff,
        keyLength & 0xff,
      ]),
      primePadded,
      serverPubPadded,
    ]);

    // Mock SocketBuffer matching the library's interface:
    // readUInt16BE(), readNBytesOffset(N) — same methods the real SocketBuffer has
    let offset = 0;
    const mockSocket = {
      readUInt16BE: vi.fn().mockImplementation(async () => {
        const val = serverData.readUInt16BE(offset);
        offset += 2;
        return val;
      }),
      readNBytesOffset: vi.fn().mockImplementation(async (n: number) => {
        const slice = serverData.subarray(offset, offset + n);
        offset += n;
        return slice;
      }),
    };

    const writtenChunks: Buffer[] = [];
    const mockConn = {
      write: vi.fn().mockImplementation((data: Buffer) => {
        writtenChunks.push(Buffer.from(data));
      }),
    } as any;

    await handler.authenticate('3.8', mockSocket, mockConn, {
      username: 'testuser',
      password: 'testpass',
    });

    // Verify socket read calls
    expect(mockSocket.readUInt16BE).toHaveBeenCalledTimes(2); // generator + keyLength
    expect(mockSocket.readNBytesOffset).toHaveBeenCalledTimes(2); // prime + serverPubKey
    expect(mockSocket.readNBytesOffset).toHaveBeenNthCalledWith(1, keyLength);
    expect(mockSocket.readNBytesOffset).toHaveBeenNthCalledWith(2, keyLength);

    // Verify response was written
    expect(mockConn.write).toHaveBeenCalledTimes(1);
    const response = writtenChunks[0];

    // Response should be: encryptedCredentials(128) + clientPublicKey(keyLength)
    // Per Apple ARD spec: ciphertext first, then public key
    expect(response.length).toBe(128 + keyLength);

    // Verify we can decrypt the credentials using the server's shared secret
    const encryptedCredentials = response.subarray(0, 128);
    const clientPublicKey = response.subarray(128);

    const sharedSecret = serverDH.computeSecret(clientPublicKey);
    // Pad shared secret to keyLength (same as implementation)
    let paddedSecret = sharedSecret;
    if (sharedSecret.length < keyLength) {
      paddedSecret = Buffer.alloc(keyLength);
      sharedSecret.copy(paddedSecret, keyLength - sharedSecret.length);
    }
    const aesKey = crypto.createHash('md5').update(paddedSecret).digest();

    const decipher = crypto.createDecipheriv('aes-128-ecb', aesKey, null);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([
      decipher.update(encryptedCredentials),
      decipher.final(),
    ]);

    // Verify decrypted credentials (null-terminated, random-padded)
    const usernameEnd = decrypted.indexOf(0, 0);
    const decryptedUsername = decrypted.subarray(0, usernameEnd).toString('utf-8');
    const passwordEnd = decrypted.indexOf(0, 64);
    const decryptedPassword = decrypted.subarray(64, passwordEnd).toString('utf-8');

    expect(decryptedUsername).toBe('testuser');
    expect(decryptedPassword).toBe('testpass');
  });
});
