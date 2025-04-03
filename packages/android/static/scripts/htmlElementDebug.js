var midscene_element_inspector = (() => {
  var e = Object.create,
    t = Object.defineProperty,
    n = Object.defineProperties,
    i = Object.getOwnPropertyDescriptor,
    r = Object.getOwnPropertyDescriptors,
    o = Object.getOwnPropertyNames,
    h = Object.getOwnPropertySymbols,
    a = Object.getPrototypeOf,
    s = Object.prototype.hasOwnProperty,
    l = Object.prototype.propertyIsEnumerable,
    f = (e, n, i) =>
      n in e
        ? t(e, n, { enumerable: !0, configurable: !0, writable: !0, value: i })
        : (e[n] = i),
    c = (e, t) => {
      for (var n in t || (t = {})) s.call(t, n) && f(e, n, t[n]);
      if (h) for (var n of h(t)) l.call(t, n) && f(e, n, t[n]);
      return e;
    },
    d = (e, t) => n(e, r(t)),
    u = (e, t) => () => (
      t || (0, e[o(e)[0]])((t = { exports: {} }).exports, t), t.exports
    ),
    p = (e, n, r, h) => {
      if ((n && 'object' == typeof n) || 'function' == typeof n)
        for (const a of o(n))
          s.call(e, a) ||
            a === r ||
            t(e, a, {
              get: () => n[a],
              enumerable: !(h = i(n, a)) || h.enumerable,
            });
      return e;
    },
    m = u({
      'resolve-false:/empty-stub'(e, t) {
        t.exports = {};
      },
    });
  function y(e) {
    return (
      e instanceof Element &&
      (window.getComputedStyle(e).fontFamily || '')
        .toLowerCase()
        .indexOf('iconfont') >= 0
    );
  }
  function b(e) {
    if (!(e instanceof HTMLElement)) return !1;
    if (e.innerText) return !0;
    for (const t of [
      'svg',
      'button',
      'input',
      'textarea',
      'select',
      'option',
      'img',
    ])
      if (e.querySelectorAll(t).length > 0) return !0;
    return !1;
  }
  var g = ((n, i, r) => (
      (r = null != n ? e(a(n)) : {}),
      p(
        n && n.__esModule ? r : t(r, 'default', { value: n, enumerable: !0 }),
        n,
      )
    ))(
      u({
        '../../node_modules/.pnpm/js-sha256@0.11.0/node_modules/js-sha256/src/sha256.js'(
          e,
          t,
        ) {
          !(() => {
            var e = 'input is invalid type',
              n = 'object' == typeof window,
              i = n ? window : {};
            i.JS_SHA256_NO_WINDOW && (n = !1);
            var r = !n && 'object' == typeof self,
              o =
                !i.JS_SHA256_NO_NODE_JS &&
                'object' == typeof process &&
                process.versions &&
                process.versions.node;
            o ? (i = global) : r && (i = self);
            var h =
                !i.JS_SHA256_NO_COMMON_JS && 'object' == typeof t && t.exports,
              a = 'function' == typeof define && define.amd,
              s =
                !i.JS_SHA256_NO_ARRAY_BUFFER &&
                'undefined' != typeof ArrayBuffer,
              l = '0123456789abcdef'.split(''),
              f = [-0x80000000, 8388608, 32768, 128],
              c = [24, 16, 8, 0],
              d = [
                0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
                0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
                0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
                0xc19bf174, 0xe49b69c1, 0xefbe4786, 0xfc19dc6, 0x240ca1cc,
                0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
                0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
                0x6ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
                0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
                0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
                0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
                0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
                0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
              ],
              u = ['hex', 'array', 'digest', 'arrayBuffer'],
              p = [];
            (i.JS_SHA256_NO_NODE_JS || !Array.isArray) &&
              (Array.isArray = (e) =>
                '[object Array]' === Object.prototype.toString.call(e)),
              s &&
                (i.JS_SHA256_NO_ARRAY_BUFFER_IS_VIEW || !ArrayBuffer.isView) &&
                (ArrayBuffer.isView = (e) =>
                  'object' == typeof e &&
                  e.buffer &&
                  e.buffer.constructor === ArrayBuffer);
            var y = (e, t) => (n) => new N(t, !0).update(n)[e](),
              b = (e) => {
                var t = y('hex', e);
                o && (t = g(t, e)),
                  (t.create = () => new N(e)),
                  (t.update = (e) => t.create().update(e));
                for (var n = 0; n < u.length; ++n) {
                  var i = u[n];
                  t[i] = y(i, e);
                }
                return t;
              },
              g = (t, n) => {
                var r,
                  o = m(),
                  h = m().Buffer,
                  a = n ? 'sha224' : 'sha256';
                return (
                  (r =
                    h.from && !i.JS_SHA256_NO_BUFFER_FROM
                      ? h.from
                      : (e) => new h(e)),
                  (n) => {
                    if ('string' == typeof n)
                      return o.createHash(a).update(n, 'utf8').digest('hex');
                    if (null == n) throw Error(e);
                    return (
                      n.constructor === ArrayBuffer && (n = new Uint8Array(n)),
                      Array.isArray(n) ||
                      ArrayBuffer.isView(n) ||
                      n.constructor === h
                        ? o.createHash(a).update(r(n)).digest('hex')
                        : t(n)
                    );
                  }
                );
              },
              x = (e, t) => (n, i) => new T(n, t, !0).update(i)[e](),
              w = (e) => {
                var t = x('hex', e);
                (t.create = (t) => new T(t, e)),
                  (t.update = (e, n) => t.create(e).update(n));
                for (var n = 0; n < u.length; ++n) {
                  var i = u[n];
                  t[i] = x(i, e);
                }
                return t;
              };
            function N(e, t) {
              t
                ? ((p[0] =
                    p[16] =
                    p[1] =
                    p[2] =
                    p[3] =
                    p[4] =
                    p[5] =
                    p[6] =
                    p[7] =
                    p[8] =
                    p[9] =
                    p[10] =
                    p[11] =
                    p[12] =
                    p[13] =
                    p[14] =
                    p[15] =
                      0),
                  (this.blocks = p))
                : (this.blocks = [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                  ]),
                e
                  ? ((this.h0 = 0xc1059ed8),
                    (this.h1 = 0x367cd507),
                    (this.h2 = 0x3070dd17),
                    (this.h3 = 0xf70e5939),
                    (this.h4 = 0xffc00b31),
                    (this.h5 = 0x68581511),
                    (this.h6 = 0x64f98fa7),
                    (this.h7 = 0xbefa4fa4))
                  : ((this.h0 = 0x6a09e667),
                    (this.h1 = 0xbb67ae85),
                    (this.h2 = 0x3c6ef372),
                    (this.h3 = 0xa54ff53a),
                    (this.h4 = 0x510e527f),
                    (this.h5 = 0x9b05688c),
                    (this.h6 = 0x1f83d9ab),
                    (this.h7 = 0x5be0cd19)),
                (this.block = this.start = this.bytes = this.hBytes = 0),
                (this.finalized = this.hashed = !1),
                (this.first = !0),
                (this.is224 = e);
            }
            function T(t, n, i) {
              var r,
                o = typeof t;
              if ('string' === o) {
                var h,
                  a = [],
                  l = t.length,
                  f = 0;
                for (r = 0; r < l; ++r)
                  (h = t.charCodeAt(r)) < 128
                    ? (a[f++] = h)
                    : (h < 2048
                        ? (a[f++] = 192 | (h >>> 6))
                        : (h < 55296 || h >= 57344
                            ? (a[f++] = 224 | (h >>> 12))
                            : ((h =
                                65536 +
                                (((1023 & h) << 10) |
                                  (1023 & t.charCodeAt(++r)))),
                              (a[f++] = 240 | (h >>> 18)),
                              (a[f++] = 128 | ((h >>> 12) & 63))),
                          (a[f++] = 128 | ((h >>> 6) & 63))),
                      (a[f++] = 128 | (63 & h)));
                t = a;
              } else if ('object' === o) {
                if (null === t) throw Error(e);
                else if (s && t.constructor === ArrayBuffer)
                  t = new Uint8Array(t);
                else if (!Array.isArray(t) && (!s || !ArrayBuffer.isView(t)))
                  throw Error(e);
              } else throw Error(e);
              t.length > 64 && (t = new N(n, !0).update(t).array());
              var c = [],
                d = [];
              for (r = 0; r < 64; ++r) {
                var u = t[r] || 0;
                (c[r] = 92 ^ u), (d[r] = 54 ^ u);
              }
              N.call(this, n, i),
                this.update(d),
                (this.oKeyPad = c),
                (this.inner = !0),
                (this.sharedMemory = i);
            }
            (N.prototype.update = function (t) {
              if (!this.finalized) {
                var n,
                  i = typeof t;
                if ('string' !== i) {
                  if ('object' === i) {
                    if (null === t) throw Error(e);
                    else if (s && t.constructor === ArrayBuffer)
                      t = new Uint8Array(t);
                    else if (
                      !Array.isArray(t) &&
                      (!s || !ArrayBuffer.isView(t))
                    )
                      throw Error(e);
                  } else throw Error(e);
                  n = !0;
                }
                for (var r, o, h = 0, a = t.length, l = this.blocks; h < a; ) {
                  if (
                    (this.hashed &&
                      ((this.hashed = !1),
                      (l[0] = this.block),
                      (this.block =
                        l[16] =
                        l[1] =
                        l[2] =
                        l[3] =
                        l[4] =
                        l[5] =
                        l[6] =
                        l[7] =
                        l[8] =
                        l[9] =
                        l[10] =
                        l[11] =
                        l[12] =
                        l[13] =
                        l[14] =
                        l[15] =
                          0)),
                    n)
                  )
                    for (o = this.start; h < a && o < 64; ++h)
                      l[o >>> 2] |= t[h] << c[3 & o++];
                  else
                    for (o = this.start; h < a && o < 64; ++h)
                      (r = t.charCodeAt(h)) < 128
                        ? (l[o >>> 2] |= r << c[3 & o++])
                        : (r < 2048
                            ? (l[o >>> 2] |= (192 | (r >>> 6)) << c[3 & o++])
                            : (r < 55296 || r >= 57344
                                ? (l[o >>> 2] |=
                                    (224 | (r >>> 12)) << c[3 & o++])
                                : ((r =
                                    65536 +
                                    (((1023 & r) << 10) |
                                      (1023 & t.charCodeAt(++h)))),
                                  (l[o >>> 2] |=
                                    (240 | (r >>> 18)) << c[3 & o++]),
                                  (l[o >>> 2] |=
                                    (128 | ((r >>> 12) & 63)) << c[3 & o++])),
                              (l[o >>> 2] |=
                                (128 | ((r >>> 6) & 63)) << c[3 & o++])),
                          (l[o >>> 2] |= (128 | (63 & r)) << c[3 & o++]));
                  (this.lastByteIndex = o),
                    (this.bytes += o - this.start),
                    o >= 64
                      ? ((this.block = l[16]),
                        (this.start = o - 64),
                        this.hash(),
                        (this.hashed = !0))
                      : (this.start = o);
                }
                return (
                  this.bytes > 0xffffffff &&
                    ((this.hBytes += (this.bytes / 0x100000000) << 0),
                    (this.bytes = this.bytes % 0x100000000)),
                  this
                );
              }
            }),
              (N.prototype.finalize = function () {
                if (!this.finalized) {
                  this.finalized = !0;
                  var e = this.blocks,
                    t = this.lastByteIndex;
                  (e[16] = this.block),
                    (e[t >>> 2] |= f[3 & t]),
                    (this.block = e[16]),
                    t >= 56 &&
                      (this.hashed || this.hash(),
                      (e[0] = this.block),
                      (e[16] =
                        e[1] =
                        e[2] =
                        e[3] =
                        e[4] =
                        e[5] =
                        e[6] =
                        e[7] =
                        e[8] =
                        e[9] =
                        e[10] =
                        e[11] =
                        e[12] =
                        e[13] =
                        e[14] =
                        e[15] =
                          0)),
                    (e[14] = (this.hBytes << 3) | (this.bytes >>> 29)),
                    (e[15] = this.bytes << 3),
                    this.hash();
                }
              }),
              (N.prototype.hash = function () {
                var e,
                  t,
                  n,
                  i,
                  r,
                  o,
                  h,
                  a,
                  s,
                  l,
                  f,
                  c = this.h0,
                  u = this.h1,
                  p = this.h2,
                  m = this.h3,
                  y = this.h4,
                  b = this.h5,
                  g = this.h6,
                  x = this.h7,
                  w = this.blocks;
                for (e = 16; e < 64; ++e)
                  (t =
                    (((r = w[e - 15]) >>> 7) | (r << 25)) ^
                    ((r >>> 18) | (r << 14)) ^
                    (r >>> 3)),
                    (n =
                      (((r = w[e - 2]) >>> 17) | (r << 15)) ^
                      ((r >>> 19) | (r << 13)) ^
                      (r >>> 10)),
                    (w[e] = (w[e - 16] + t + w[e - 7] + n) << 0);
                for (e = 0, f = u & p; e < 64; e += 4)
                  this.first
                    ? (this.is224
                        ? ((a = 300032),
                          (x = ((r = w[0] - 0x543c9a5b) - 0x8f1a6c7) << 0),
                          (m = (r + 0x170e9b5) << 0))
                        : ((a = 0x2a01a605),
                          (x = ((r = w[0] - 0xc881298) - 0x5ab00ac6) << 0),
                          (m = (r + 0x8909ae5) << 0)),
                      (this.first = !1))
                    : ((t =
                        ((c >>> 2) | (c << 30)) ^
                        ((c >>> 13) | (c << 19)) ^
                        ((c >>> 22) | (c << 10))),
                      (n =
                        ((y >>> 6) | (y << 26)) ^
                        ((y >>> 11) | (y << 21)) ^
                        ((y >>> 25) | (y << 7))),
                      (i = (a = c & u) ^ (c & p) ^ f),
                      (r = x + n + ((y & b) ^ (~y & g)) + d[e] + w[e]),
                      (o = t + i),
                      (x = (m + r) << 0),
                      (m = (r + o) << 0)),
                    (t =
                      ((m >>> 2) | (m << 30)) ^
                      ((m >>> 13) | (m << 19)) ^
                      ((m >>> 22) | (m << 10))),
                    (n =
                      ((x >>> 6) | (x << 26)) ^
                      ((x >>> 11) | (x << 21)) ^
                      ((x >>> 25) | (x << 7))),
                    (i = (s = m & c) ^ (m & u) ^ a),
                    (r = g + n + ((x & y) ^ (~x & b)) + d[e + 1] + w[e + 1]),
                    (o = t + i),
                    (g = (p + r) << 0),
                    (t =
                      (((p = (r + o) << 0) >>> 2) | (p << 30)) ^
                      ((p >>> 13) | (p << 19)) ^
                      ((p >>> 22) | (p << 10))),
                    (n =
                      ((g >>> 6) | (g << 26)) ^
                      ((g >>> 11) | (g << 21)) ^
                      ((g >>> 25) | (g << 7))),
                    (i = (l = p & m) ^ (p & c) ^ s),
                    (r = b + n + ((g & x) ^ (~g & y)) + d[e + 2] + w[e + 2]),
                    (o = t + i),
                    (b = (u + r) << 0),
                    (t =
                      (((u = (r + o) << 0) >>> 2) | (u << 30)) ^
                      ((u >>> 13) | (u << 19)) ^
                      ((u >>> 22) | (u << 10))),
                    (n =
                      ((b >>> 6) | (b << 26)) ^
                      ((b >>> 11) | (b << 21)) ^
                      ((b >>> 25) | (b << 7))),
                    (i = (f = u & p) ^ (u & m) ^ l),
                    (r = y + n + ((b & g) ^ (~b & x)) + d[e + 3] + w[e + 3]),
                    (o = t + i),
                    (y = (c + r) << 0),
                    (c = (r + o) << 0),
                    (this.chromeBugWorkAround = !0);
                (this.h0 = (this.h0 + c) << 0),
                  (this.h1 = (this.h1 + u) << 0),
                  (this.h2 = (this.h2 + p) << 0),
                  (this.h3 = (this.h3 + m) << 0),
                  (this.h4 = (this.h4 + y) << 0),
                  (this.h5 = (this.h5 + b) << 0),
                  (this.h6 = (this.h6 + g) << 0),
                  (this.h7 = (this.h7 + x) << 0);
              }),
              (N.prototype.hex = function () {
                this.finalize();
                var e = this.h0,
                  t = this.h1,
                  n = this.h2,
                  i = this.h3,
                  r = this.h4,
                  o = this.h5,
                  h = this.h6,
                  a = this.h7,
                  s =
                    l[(e >>> 28) & 15] +
                    l[(e >>> 24) & 15] +
                    l[(e >>> 20) & 15] +
                    l[(e >>> 16) & 15] +
                    l[(e >>> 12) & 15] +
                    l[(e >>> 8) & 15] +
                    l[(e >>> 4) & 15] +
                    l[15 & e] +
                    l[(t >>> 28) & 15] +
                    l[(t >>> 24) & 15] +
                    l[(t >>> 20) & 15] +
                    l[(t >>> 16) & 15] +
                    l[(t >>> 12) & 15] +
                    l[(t >>> 8) & 15] +
                    l[(t >>> 4) & 15] +
                    l[15 & t] +
                    l[(n >>> 28) & 15] +
                    l[(n >>> 24) & 15] +
                    l[(n >>> 20) & 15] +
                    l[(n >>> 16) & 15] +
                    l[(n >>> 12) & 15] +
                    l[(n >>> 8) & 15] +
                    l[(n >>> 4) & 15] +
                    l[15 & n] +
                    l[(i >>> 28) & 15] +
                    l[(i >>> 24) & 15] +
                    l[(i >>> 20) & 15] +
                    l[(i >>> 16) & 15] +
                    l[(i >>> 12) & 15] +
                    l[(i >>> 8) & 15] +
                    l[(i >>> 4) & 15] +
                    l[15 & i] +
                    l[(r >>> 28) & 15] +
                    l[(r >>> 24) & 15] +
                    l[(r >>> 20) & 15] +
                    l[(r >>> 16) & 15] +
                    l[(r >>> 12) & 15] +
                    l[(r >>> 8) & 15] +
                    l[(r >>> 4) & 15] +
                    l[15 & r] +
                    l[(o >>> 28) & 15] +
                    l[(o >>> 24) & 15] +
                    l[(o >>> 20) & 15] +
                    l[(o >>> 16) & 15] +
                    l[(o >>> 12) & 15] +
                    l[(o >>> 8) & 15] +
                    l[(o >>> 4) & 15] +
                    l[15 & o] +
                    l[(h >>> 28) & 15] +
                    l[(h >>> 24) & 15] +
                    l[(h >>> 20) & 15] +
                    l[(h >>> 16) & 15] +
                    l[(h >>> 12) & 15] +
                    l[(h >>> 8) & 15] +
                    l[(h >>> 4) & 15] +
                    l[15 & h];
                return (
                  this.is224 ||
                    (s +=
                      l[(a >>> 28) & 15] +
                      l[(a >>> 24) & 15] +
                      l[(a >>> 20) & 15] +
                      l[(a >>> 16) & 15] +
                      l[(a >>> 12) & 15] +
                      l[(a >>> 8) & 15] +
                      l[(a >>> 4) & 15] +
                      l[15 & a]),
                  s
                );
              }),
              (N.prototype.toString = N.prototype.hex),
              (N.prototype.digest = function () {
                this.finalize();
                var e = this.h0,
                  t = this.h1,
                  n = this.h2,
                  i = this.h3,
                  r = this.h4,
                  o = this.h5,
                  h = this.h6,
                  a = this.h7,
                  s = [
                    (e >>> 24) & 255,
                    (e >>> 16) & 255,
                    (e >>> 8) & 255,
                    255 & e,
                    (t >>> 24) & 255,
                    (t >>> 16) & 255,
                    (t >>> 8) & 255,
                    255 & t,
                    (n >>> 24) & 255,
                    (n >>> 16) & 255,
                    (n >>> 8) & 255,
                    255 & n,
                    (i >>> 24) & 255,
                    (i >>> 16) & 255,
                    (i >>> 8) & 255,
                    255 & i,
                    (r >>> 24) & 255,
                    (r >>> 16) & 255,
                    (r >>> 8) & 255,
                    255 & r,
                    (o >>> 24) & 255,
                    (o >>> 16) & 255,
                    (o >>> 8) & 255,
                    255 & o,
                    (h >>> 24) & 255,
                    (h >>> 16) & 255,
                    (h >>> 8) & 255,
                    255 & h,
                  ];
                return (
                  this.is224 ||
                    s.push(
                      (a >>> 24) & 255,
                      (a >>> 16) & 255,
                      (a >>> 8) & 255,
                      255 & a,
                    ),
                  s
                );
              }),
              (N.prototype.array = N.prototype.digest),
              (N.prototype.arrayBuffer = function () {
                this.finalize();
                var e = new ArrayBuffer(this.is224 ? 28 : 32),
                  t = new DataView(e);
                return (
                  t.setUint32(0, this.h0),
                  t.setUint32(4, this.h1),
                  t.setUint32(8, this.h2),
                  t.setUint32(12, this.h3),
                  t.setUint32(16, this.h4),
                  t.setUint32(20, this.h5),
                  t.setUint32(24, this.h6),
                  this.is224 || t.setUint32(28, this.h7),
                  e
                );
              }),
              (T.prototype = new N()),
              (T.prototype.finalize = function () {
                if ((N.prototype.finalize.call(this), this.inner)) {
                  this.inner = !1;
                  var e = this.array();
                  N.call(this, this.is224, this.sharedMemory),
                    this.update(this.oKeyPad),
                    this.update(e),
                    N.prototype.finalize.call(this);
                }
              });
            var v = b();
            (v.sha256 = v),
              (v.sha224 = b(!0)),
              (v.sha256.hmac = w()),
              (v.sha224.hmac = w(!0)),
              h
                ? (t.exports = v)
                : ((i.sha256 = v.sha256),
                  (i.sha224 = v.sha224),
                  a && define(() => v));
          })();
        },
      })(),
    ),
    x = {},
    w = !1;
  function N(...e) {
    w && console.log(...e);
  }
  var T = '_midscene_retrieve_task_id';
  function v(e, t, n, i) {
    if (!(e instanceof i.HTMLElement)) return '';
    if (!T) return console.error('No task id found'), '';
    const r = `[${T}='${t}']`;
    return (
      w &&
        (n
          ? e.parentNode instanceof i.HTMLElement &&
            e.parentNode.setAttribute(T, t.toString())
          : e.setAttribute(T, t.toString())),
      r
    );
  }
  function E(e, t) {
    const n = Math.max(e.left, t.left),
      i = Math.max(e.top, t.top),
      r = Math.min(e.right, t.right),
      o = Math.min(e.bottom, t.bottom);
    return n < r && i < o
      ? {
          left: n,
          top: i,
          right: r,
          bottom: o,
          width: r - n,
          height: o - i,
          x: n,
          y: i,
          zoom: 1,
        }
      : null;
  }
  function M(e, t, n) {
    let i,
      r = 1;
    if (e instanceof n.HTMLElement)
      (i = e.getBoundingClientRect()),
        'currentCSSZoom' in e ||
          (r = Number.parseFloat(n.getComputedStyle(e).zoom) || 1);
    else {
      const t = n.document.createRange();
      t.selectNodeContents(e), (i = t.getBoundingClientRect());
    }
    const o = r * t;
    return {
      width: i.width * o,
      height: i.height * o,
      left: i.left * o,
      top: i.top * o,
      right: i.right * o,
      bottom: i.bottom * o,
      x: i.x * o,
      y: i.y * o,
      zoom: o,
    };
  }
  var A = (e, t, n) => {
    const i = t.left + t.width / 2,
      r = t.top + t.height / 2,
      o = n.document.elementFromPoint(i, r);
    return (
      !(
        !o ||
        o === e ||
        (null == e ? void 0 : e.contains(o)) ||
        (null == o ? void 0 : o.contains(e))
      ) &&
      !!E(t, M(o, 1, n)) &&
      (N(e, 'Element is covered by another element', {
        topElement: o,
        el: e,
        rect: t,
        x: i,
        y: r,
      }),
      !0)
    );
  };
  function O(e, t, n, i = 1) {
    if (
      !e ||
      (!(e instanceof t.HTMLElement) &&
        e.nodeType !== Node.TEXT_NODE &&
        'svg' !== e.nodeName.toLowerCase())
    )
      return N(e, 'Element is not in the DOM hierarchy'), !1;
    if (e instanceof t.HTMLElement) {
      const n = t.getComputedStyle(e);
      if (
        'none' === n.display ||
        'hidden' === n.visibility ||
        ('0' === n.opacity && 'INPUT' !== e.tagName)
      )
        return N(e, 'Element is hidden'), !1;
    }
    const r = M(e, i, t);
    if (0 === r.width && 0 === r.height) return N(e, 'Element has no size'), !1;
    if (1 === i && A(e, r, t)) return !1;
    const o = t.pageXOffset || n.documentElement.scrollLeft,
      h = t.pageYOffset || n.documentElement.scrollTop,
      a = t.innerWidth || n.documentElement.clientWidth,
      s = t.innerHeight || n.documentElement.clientHeight;
    if (
      !((e, t, n) => {
        const i = e.height,
          r = e.width,
          o = E(e, {
            left: 0,
            top: 0,
            width: t.innerWidth || n.documentElement.clientWidth,
            height: t.innerHeight || n.documentElement.clientHeight,
            right: t.innerWidth || n.documentElement.clientWidth,
            bottom: t.innerHeight || n.documentElement.clientHeight,
            x: 0,
            y: 0,
            zoom: 1,
          });
        return !!o && (o.width * o.height) / (i * r) >= 2 / 3;
      })(r, t, n)
    )
      return (
        N(e, 'Element is completely outside the viewport', {
          rect: r,
          viewportHeight: s,
          viewportWidth: a,
          scrollTop: h,
          scrollLeft: o,
        }),
        !1
      );
    let l = e,
      f = (e) => {
        let n = null == e ? void 0 : e.parentElement;
        while (n) {
          if ('static' !== t.getComputedStyle(n).position) return n;
          n = n.parentElement;
        }
        return null;
      };
    while (l && l !== n.body) {
      if (!(l instanceof t.HTMLElement)) {
        l = l.parentElement;
        continue;
      }
      const n = t.getComputedStyle(l);
      if ('hidden' === n.overflow) {
        const n = M(l, 1, t);
        if (
          r.right < n.left - 10 ||
          r.left > n.right + 10 ||
          r.bottom < n.top - 10 ||
          r.top > n.bottom + 10
        )
          return (
            N(e, 'element is partially or totally hidden by an ancestor', {
              rect: r,
              parentRect: n,
            }),
            !1
          );
      }
      if ('fixed' === n.position || 'sticky' === n.position) break;
      l = 'absolute' === n.position ? f(l) : l.parentElement;
    }
    return {
      left: Math.round(r.left),
      top: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
      zoom: r.zoom,
    };
  }
  function C(e, t) {
    return e && e instanceof t.HTMLElement && e.attributes
      ? Object.fromEntries(
          Array.from(e.attributes).map((e) => {
            if ('class' === e.name)
              return [e.name, `.${e.value.split(' ').join('.')}`];
            if (!e.value) return [];
            let t = e.value;
            return (
              t.startsWith('data:image') && (t = 'image'),
              t.length > 300 && (t = `${t.slice(0, 300)}...`),
              [e.name, t]
            );
          }),
        )
      : {};
  }
  function _(e, t, n) {
    return ((e, t = '') => {
      let n = JSON.stringify({ content: t, rect: e }),
        i = 5,
        r = '',
        o = g.sha256
          .create()
          .update(n)
          .hex()
          .split('')
          .map((e) => String.fromCharCode(97 + (Number.parseInt(e, 16) % 26)))
          .join('');
      while (i < o.length - 1) {
        if (x[(r = o.slice(0, i))] && x[r] !== n) {
          i++;
          continue;
        }
        x[r] = n;
        break;
      }
      return r;
    })(n, t);
  }
  var H = 0;
  function S(e) {
    let t = '';
    e instanceof HTMLElement && (t = e.tagName.toLowerCase());
    const n = e.parentElement;
    return (
      n && n instanceof HTMLElement && (t = n.tagName.toLowerCase()),
      t ? `<${t}>` : ''
    );
  }
  function L(e, t, n, i = 1, r = { left: 0, top: 0 }) {
    var o;
    const h = O(e, t, n, i);
    if (
      !h ||
      h.width < 3 ||
      h.height < 3 ||
      ((0 !== r.left || 0 !== r.top) && ((h.left += r.left), (h.top += r.top)),
      h.height >= window.innerHeight && h.width >= window.innerWidth)
    )
      return null;
    if (
      e instanceof HTMLElement &&
      ('input' === e.tagName.toLowerCase() ||
        'textarea' === e.tagName.toLowerCase() ||
        'select' === e.tagName.toLowerCase() ||
        'option' === e.tagName.toLowerCase())
    ) {
      let n = C(e, t),
        i = n.value || n.placeholder || e.textContent || '',
        r = _(e, i, h),
        o = v(e, r, !1, t),
        a = e.tagName.toLowerCase();
      return (
        'select' === e.tagName.toLowerCase() &&
          (i = e.options[e.selectedIndex].textContent || ''),
        ('input' === e.tagName.toLowerCase() ||
          'textarea' === e.tagName.toLowerCase()) &&
          e.value &&
          (i = e.value),
        {
          id: r,
          nodeHashId: r,
          locator: o,
          nodeType: 'FORM_ITEM Node',
          indexId: H++,
          attributes: d(c({}, n), {
            htmlTagName: `<${a}>`,
            nodeType: 'FORM_ITEM Node',
          }),
          content: i.trim(),
          rect: h,
          center: [
            Math.round(h.left + h.width / 2),
            Math.round(h.top + h.height / 2),
          ],
          zoom: h.zoom,
          screenWidth: t.innerWidth,
          screenHeight: t.innerHeight,
        }
      );
    }
    if (e instanceof HTMLElement && 'button' === e.tagName.toLowerCase()) {
      const n = C(e, t),
        i = ((e, t) => {
          if (!(e instanceof t.HTMLElement)) return { before: '', after: '' };
          const n = t
              .getComputedStyle(e, '::before')
              .getPropertyValue('content'),
            i = t.getComputedStyle(e, '::after').getPropertyValue('content');
          return {
            before: 'none' === n ? '' : n.replace(/"/g, ''),
            after: 'none' === i ? '' : i.replace(/"/g, ''),
          };
        })(e, t),
        r = e.innerText || i.before || i.after || '',
        o = _(e, r, h),
        a = v(e, o, !1, t);
      return {
        id: o,
        indexId: H++,
        nodeHashId: o,
        nodeType: 'BUTTON Node',
        locator: a,
        attributes: d(c({}, n), { htmlTagName: S(e), nodeType: 'BUTTON Node' }),
        content: r,
        rect: h,
        center: [
          Math.round(h.left + h.width / 2),
          Math.round(h.top + h.height / 2),
        ],
        zoom: h.zoom,
        screenWidth: t.innerWidth,
        screenHeight: t.innerHeight,
      };
    }
    if (
      (!b(e) &&
        e instanceof Element &&
        'none' !==
          window.getComputedStyle(e).getPropertyValue('background-image')) ||
      y(e) ||
      (e instanceof HTMLElement && 'img' === e.tagName.toLowerCase()) ||
      (e instanceof SVGElement && 'svg' === e.tagName.toLowerCase())
    ) {
      const n = C(e, t),
        i = _(e, '', h),
        r = v(e, i, !1, t);
      return {
        id: i,
        indexId: H++,
        nodeHashId: i,
        locator: r,
        attributes: d(
          c(
            c({}, n),
            'svg' === e.nodeName.toLowerCase() ? { svgContent: 'true' } : {},
          ),
          { nodeType: 'IMG Node', htmlTagName: S(e) },
        ),
        nodeType: 'IMG Node',
        content: '',
        rect: h,
        center: [
          Math.round(h.left + h.width / 2),
          Math.round(h.top + h.height / 2),
        ],
        zoom: h.zoom,
        screenWidth: t.innerWidth,
        screenHeight: t.innerHeight,
      };
    }
    if ('#text' === e.nodeName.toLowerCase() && !y(e)) {
      const n =
        null == (o = e.textContent) ? void 0 : o.trim().replace(/\n+/g, ' ');
      if (!n) return null;
      const i = C(e, t),
        r = Object.keys(i);
      if (!n.trim() && 0 === r.length) return null;
      const a = _(e, n, h),
        s = v(e, a, !0, t);
      return {
        id: a,
        indexId: H++,
        nodeHashId: a,
        nodeType: 'TEXT Node',
        locator: s,
        attributes: d(c({}, i), { nodeType: 'TEXT Node', htmlTagName: S(e) }),
        center: [
          Math.round(h.left + h.width / 2),
          Math.round(h.top + h.height / 2),
        ],
        content: n,
        rect: h,
        zoom: h.zoom,
        screenWidth: t.innerWidth,
        screenHeight: t.innerHeight,
      };
    }
    if (
      !(!(e instanceof HTMLElement) || b(e)) &&
      window.getComputedStyle(e).getPropertyValue('background-color')
    ) {
      const n = C(e, t),
        i = _(e, '', h),
        r = v(e, i, !1, t);
      return {
        id: i,
        nodeHashId: i,
        indexId: H++,
        nodeType: 'CONTAINER Node',
        locator: r,
        attributes: d(c({}, n), {
          nodeType: 'CONTAINER Node',
          htmlTagName: S(e),
        }),
        content: '',
        rect: h,
        center: [
          Math.round(h.left + h.width / 2),
          Math.round(h.top + h.height / 2),
        ],
        zoom: h.zoom,
        screenWidth: t.innerWidth,
        screenHeight: t.innerHeight,
      };
    }
    return null;
  }
  function z(e, t = !1) {
    const n = ((e, t = !1) => {
        (w = t), (H = 0);
        const n = document.body || document,
          i = e || n,
          r = [];
        function o(e, t, n, i = 1, r = { left: 0, top: 0 }) {
          if (!e || (e.nodeType && 10 === e.nodeType)) return null;
          const h = L(e, t, n, i, r);
          if (
            e instanceof t.HTMLIFrameElement &&
            e.contentWindow &&
            e.contentWindow
          )
            return null;
          const a = { node: h, children: [] };
          if (
            (null == h ? void 0 : h.nodeType) === 'BUTTON Node' ||
            (null == h ? void 0 : h.nodeType) === 'IMG Node' ||
            (null == h ? void 0 : h.nodeType) === 'TEXT Node' ||
            (null == h ? void 0 : h.nodeType) === 'FORM_ITEM Node' ||
            (null == h ? void 0 : h.nodeType) === 'CONTAINER Node'
          )
            return a;
          const s = M(e, i, t);
          for (let i = 0; i < e.childNodes.length; i++) {
            N('will dfs', e.childNodes[i]);
            const h = o(e.childNodes[i], t, n, s.zoom, r);
            h && a.children.push(h);
          }
          return a;
        }
        const h = o(i, window, document, 1, { left: 0, top: 0 });
        if ((h && r.push(h), i === n)) {
          const e = document.querySelectorAll('iframe');
          for (let t = 0; t < e.length; t++) {
            const n = e[t];
            if (n.contentDocument && n.contentWindow) {
              const e = L(n, window, document, 1);
              if (e) {
                const t = o(
                  n.contentDocument.body,
                  n.contentWindow,
                  n.contentDocument,
                  1,
                  { left: e.rect.left, top: e.rect.top },
                );
                t && r.push(t);
              }
            }
          }
        }
        return { node: null, children: r };
      })(e, t),
      i = [];
    return (
      !(function e(t) {
        t.node && i.push(t.node);
        for (let n = 0; n < t.children.length; n++) e(t.children[n]);
      })({ children: n.children, node: n.node }),
      i
    );
  }
  console.log(z(document.body, !0)),
    console.log(JSON.stringify(z(document.body, !0))),
    'undefined' != typeof window && (window.extractTextWithPosition = z),
    'undefined' != typeof window && (window.midsceneVisibleRect = O);
})();
