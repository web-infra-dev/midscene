import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { MjpegStreamHandler } from '../../src/mjpeg-stream-handler';

describe('MjpegStreamHandler native stream', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  test('proxies a native HTTPS MJPEG URL with its path and query intact', async () => {
    const nativeUrl = 'https://stream.example:8443/live/mjpeg?token=secret';
    const request = new EventEmitter() as any;
    const response = { setHeader: rs.fn() } as any;
    const nativeRequest = new EventEmitter();
    const nativeResponse = {
      statusCode: 200,
      headers: { 'content-type': 'multipart/x-mixed-replace' },
      pipe: rs.fn(),
    };
    const httpsGet = rs
      .spyOn(https, 'get')
      .mockImplementation((_url: any, onResponse: any) => {
        onResponse(nativeResponse);
        return nativeRequest as any;
      });
    const handler = new MjpegStreamHandler({
      getNativeUrl: () => nativeUrl,
      getActiveInterface: () => null,
      takeScreenshot: rs.fn(),
      canTakeScreenshot: () => true,
      isAgentReady: () => true,
    });

    await handler.serve(request, response);

    expect(httpsGet).toHaveBeenCalledWith(
      new URL(nativeUrl),
      expect.any(Function),
    );
    expect(nativeResponse.pipe).toHaveBeenCalledWith(response);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'multipart/x-mixed-replace',
    );
    handler.shutdown();
  });

  test('keeps the existing HTTP stream path working', async () => {
    const nativeUrl = 'http://localhost:9100/';
    const nativeRequest = new EventEmitter();
    const nativeResponse = {
      statusCode: 200,
      headers: {},
      pipe: rs.fn(),
    };
    const httpGet = rs
      .spyOn(http, 'get')
      .mockImplementation((_url: any, onResponse: any) => {
        onResponse(nativeResponse);
        return nativeRequest as any;
      });
    const handler = new MjpegStreamHandler({
      getNativeUrl: () => nativeUrl,
      getActiveInterface: () => null,
      takeScreenshot: rs.fn(),
      canTakeScreenshot: () => true,
      isAgentReady: () => true,
    });

    await handler.serve(
      new EventEmitter() as any,
      { setHeader: rs.fn() } as any,
    );

    expect(httpGet).toHaveBeenCalledWith(
      new URL(nativeUrl),
      expect.any(Function),
    );
    handler.shutdown();
  });

  test('falls back to screenshot polling when an HTTPS stream cannot connect', async () => {
    const request = Object.assign(new EventEmitter(), { query: {} }) as any;
    const response = {
      setHeader: rs.fn(),
      write: rs.fn(() => {
        request.emit('close');
        return true;
      }),
    } as any;
    const nativeRequest = new EventEmitter();
    rs.spyOn(https, 'get').mockImplementation(() => {
      queueMicrotask(() =>
        nativeRequest.emit(
          'error',
          Object.assign(new Error('secret URL'), {
            code: 'ECONNREFUSED',
          }),
        ),
      );
      return nativeRequest as any;
    });
    const takeScreenshot = rs.fn().mockResolvedValue('FRAME');
    const handler = new MjpegStreamHandler({
      getNativeUrl: () => 'https://stream.example/live/mjpeg?token=secret',
      getActiveInterface: () => null,
      takeScreenshot,
      canTakeScreenshot: () => true,
      isAgentReady: () => true,
    });

    await handler.serve(request, response);

    expect(takeScreenshot).toHaveBeenCalledTimes(1);
    expect(response.write).toHaveBeenCalled();
    handler.shutdown();
  });
});
