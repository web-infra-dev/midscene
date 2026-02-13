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

    // Build the server message:
    // generator(2 BE) + keyLength(2 BE) + prime(keyLength) + serverPubKey(keyLength)
    const header = Buffer.alloc(4);
    header.writeUInt16BE(generator, 0);
    header.writeUInt16BE(keyLength, 2);

    // Pad prime and public key to exactly keyLength bytes (left-pad)
    const primePadded = Buffer.alloc(keyLength);
    prime.copy(primePadded, keyLength - prime.length);

    const serverPubPadded = Buffer.alloc(keyLength);
    serverPublicKey.copy(serverPubPadded, keyLength - serverPublicKey.length);

    const serverMessage = Buffer.concat([header, primePadded, serverPubPadded]);

    // Mock SocketBuffer: serves data in two reads (header, then DH params)
    let bufferOffset = 0;
    const mockSocket = {
      buffer: serverMessage,
      waitBytes: vi.fn().mockImplementation(async () => {
        // Simulate data being available
      }),
      flush: vi.fn().mockImplementation((n: number) => {
        bufferOffset += n;
        mockSocket.buffer = serverMessage.subarray(bufferOffset);
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

    // Verify socket interactions
    expect(mockSocket.waitBytes).toHaveBeenCalledTimes(2);
    expect(mockSocket.waitBytes).toHaveBeenNthCalledWith(1, 4); // header
    expect(mockSocket.waitBytes).toHaveBeenNthCalledWith(2, keyLength * 2); // prime + pubkey
    expect(mockSocket.flush).toHaveBeenCalledTimes(2);

    // Verify response was written
    expect(mockConn.write).toHaveBeenCalledTimes(1);
    const response = writtenChunks[0];

    // Response should be: clientPublicKey(keyLength) + encryptedCredentials(128)
    expect(response.length).toBe(keyLength + 128);

    // Verify we can decrypt the credentials using the server's shared secret
    const clientPublicKey = response.subarray(0, keyLength);
    const encryptedCredentials = response.subarray(keyLength);

    const sharedSecret = serverDH.computeSecret(clientPublicKey);
    const aesKey = crypto.createHash('md5').update(sharedSecret).digest();

    const decipher = crypto.createDecipheriv('aes-128-ecb', aesKey, null);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([
      decipher.update(encryptedCredentials),
      decipher.final(),
    ]);

    // Verify decrypted credentials
    const decryptedUsername = decrypted
      .subarray(0, 64)
      .toString('utf-8')
      .replace(/\0+$/, '');
    const decryptedPassword = decrypted
      .subarray(64, 128)
      .toString('utf-8')
      .replace(/\0+$/, '');

    expect(decryptedUsername).toBe('testuser');
    expect(decryptedPassword).toBe('testpass');
  });
});
