import type { UiNode } from '@midscene/core/internal/device-cache';
import { describe, expect, it } from 'vitest';
import {
  buildAndroidLiveTreeAudit,
  buildAndroidVisualAudit,
  enumerateAndroidUiTree,
  getAndroidInteractionEvidence,
} from '../../src/xpath-audit';

function node(
  type: string,
  bounds: { left: number; top: number; width: number; height: number },
  attrs: Record<string, string> = {},
  children: UiNode[] = [],
): UiNode {
  return { attrs, bounds, children, type };
}

function auditTree(buttonTop = 20): UiNode {
  return node(
    'android.widget.FrameLayout',
    { left: 0, top: 0, width: 400, height: 800 },
    {},
    [
      node(
        'android.widget.Button',
        { left: 20, top: buttonTop, width: 120, height: 60 },
        { 'resource-id': 'stable-button', clickable: 'true', text: '打开' },
      ),
      node(
        'android.view.View',
        { left: 20, top: 120, width: 120, height: 60 },
        { clickable: 'true' },
      ),
    ],
  );
}

describe('Android live XPath audit', () => {
  it.each([
    [{ clickable: 'true' }, ['accessibility-flag']],
    [{ actions: 'ACTION_CLICK,ACTION_FOCUS' }, ['click-action']],
    [{ 'chrome-role': 'button' }, ['web-role']],
    [{ 'role-description': '链接' }, ['web-role']],
    [{ 'clickable-score': '0.85' }, ['clickable-score']],
    [{ 'target-url': 'https://example.com' }, ['target-url']],
  ])(
    'accepts interaction evidence beyond a single device clickable flag: %j',
    (attrs, expectedEvidence) => {
      const evidenceNode = node(
        'android.view.View',
        { left: 20, top: 20, width: 120, height: 60 },
        attrs,
      );
      expect(getAndroidInteractionEvidence(evidenceNode)).toEqual(
        expectedEvidence,
      );

      const root = node(
        'android.webkit.WebView',
        { left: 0, top: 0, width: 400, height: 800 },
        {},
        [evidenceNode],
      );
      const audit = buildAndroidLiveTreeAudit(root, {
        width: 400,
        height: 800,
      });
      expect(audit.overlays).toHaveLength(1);
      expect(audit.treeNodes[1]).toMatchObject({
        interactionEvidence: expectedEvidence,
        interactive: true,
      });
    },
  );

  it('does not treat a static Web role or ordinary text as interaction evidence', () => {
    const staticNodes = [
      node(
        'android.widget.TextView',
        { left: 20, top: 20, width: 120, height: 60 },
        { role: 'heading', text: '账户总额' },
      ),
      node(
        'android.view.View',
        { left: 20, top: 100, width: 120, height: 60 },
        { 'clickable-score': '0', text: '说明' },
      ),
    ];
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      staticNodes,
    );
    const audit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });

    expect(audit.overlays).toEqual([]);
    expect(audit.treeNodes.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          interactionEvidence: [],
          interactive: false,
        }),
      ]),
    );
  });

  it('draws actionable tree controls without full-page containers or nested duplicates', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      { focusable: 'true' },
      [
        node(
          'android.view.View',
          { left: 0, top: 0, width: 400, height: 800 },
          { scrollable: 'true' },
          [
            node(
              'android.view.View',
              { left: 20, top: 20, width: 200, height: 100 },
              { clickable: 'true', 'content-desc': '账单卡片' },
              [
                node(
                  'android.widget.TextView',
                  { left: 40, top: 40, width: 120, height: 40 },
                  { clickable: 'true', text: '查看账单' },
                ),
              ],
            ),
            node(
              'android.widget.Button',
              { left: 20, top: 160, width: 160, height: 60 },
              { clickable: 'true', text: '分期还款' },
            ),
            node(
              'android.widget.Button',
              { left: 220, top: 160, width: 160, height: 60 },
              { clickable: 'true', text: '提前还款' },
            ),
          ],
        ),
      ],
    );

    const audit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });

    expect(audit.overlays.map((overlay) => overlay.nodeId)).toEqual([
      'node-0003',
      'node-0005',
      'node-0006',
    ]);
    expect(audit.overlays.map((overlay) => overlay.rect)).toEqual([
      { left: 20, top: 20, width: 200, height: 100 },
      { left: 20, top: 160, width: 160, height: 60 },
      { left: 220, top: 160, width: 160, height: 60 },
    ]);
  });

  it('infers semantic WebView controls when Lynx omits clickable flags', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      { focusable: 'true' },
      [
        node(
          'android.view.View',
          { left: 0, top: 0, width: 400, height: 80 },
          { 'resource-id': 'full-header' },
          [
            node(
              'android.widget.Button',
              { left: 0, top: 10, width: 60, height: 60 },
              { clickable: 'true', 'content-desc': '返回' },
            ),
            node(
              'android.view.View',
              { left: 300, top: 10, width: 90, height: 60 },
              {},
              [
                node(
                  'android.view.View',
                  { left: 300, top: 20, width: 30, height: 30 },
                  {},
                  [
                    node('android.widget.Image', {
                      left: 300,
                      top: 20,
                      width: 30,
                      height: 30,
                    }),
                  ],
                ),
                node(
                  'android.view.View',
                  { left: 350, top: 20, width: 30, height: 30 },
                  {},
                  [
                    node('android.widget.Image', {
                      left: 350,
                      top: 20,
                      width: 30,
                      height: 30,
                    }),
                  ],
                ),
              ],
            ),
          ],
        ),
        node(
          'android.view.View',
          { left: 20, top: 100, width: 360, height: 70 },
          { 'resource-id': 'fullfill' },
          [
            node(
              'android.widget.TextView',
              { left: 40, top: 120, width: 120, height: 30 },
              { text: '安全保障中' },
            ),
            node('android.widget.Image', {
              left: 340,
              top: 125,
              width: 16,
              height: 16,
            }),
          ],
        ),
        node(
          'android.view.View',
          { left: 60, top: 190, width: 280, height: 30 },
          {},
          [
            node(
              'android.widget.TextView',
              { left: 60, top: 190, width: 100, height: 30 },
              { text: '招商银行' },
            ),
            node(
              'android.widget.TextView',
              { left: 160, top: 190, width: 120, height: 30 },
              { text: '自动扣款' },
            ),
            node('android.widget.Image', {
              left: 290,
              top: 197,
              width: 16,
              height: 16,
            }),
          ],
        ),
        node(
          'android.view.View',
          { left: 20, top: 250, width: 360, height: 100 },
          { 'resource-id': 'icon-container' },
          [
            node(
              'android.view.View',
              { left: 20, top: 250, width: 160, height: 100 },
              { 'resource-id': 'icon-consumer' },
              [
                node('android.widget.Image', {
                  left: 80,
                  top: 260,
                  width: 40,
                  height: 40,
                }),
                node(
                  'android.widget.TextView',
                  { left: 60, top: 310, width: 80, height: 30 },
                  { text: '消费明细' },
                ),
              ],
            ),
            node(
              'android.view.View',
              { left: 220, top: 250, width: 160, height: 100 },
              { 'resource-id': 'icon-points' },
              [
                node('android.widget.Image', {
                  left: 280,
                  top: 260,
                  width: 40,
                  height: 40,
                }),
                node(
                  'android.widget.TextView',
                  { left: 270, top: 310, width: 60, height: 30 },
                  { text: '月付金' },
                ),
              ],
            ),
          ],
        ),
        node(
          'android.widget.TextView',
          { left: 20, top: 390, width: 160, height: 30 },
          { text: '普通静态说明' },
        ),
      ],
    );

    const audit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });

    expect(audit.overlays.map((overlay) => overlay.nodeId)).toEqual([
      'node-0003',
      'node-0006',
      'node-0008',
      'node-0009',
      'node-0012',
      'node-0017',
      'node-0020',
    ]);
    expect(audit.overlays.map((overlay) => overlay.name)).toEqual([
      '返回',
      'android.widget.Image',
      'android.widget.Image',
      '安全保障中',
      '招商银行 · 自动扣款',
      '消费明细',
      '月付金',
    ]);
  });

  it('infers described Lynx controls without a WebView ancestor', () => {
    const root = node(
      'android.widget.FrameLayout',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.widget.ScrollView',
          { left: 0, top: 80, width: 400, height: 720 },
          {
            'content-desc': '钱包页面',
            focusable: 'true',
            scrollable: 'true',
          },
          [
            node(
              'android.view.ViewGroup',
              { left: 20, top: 120, width: 90, height: 72 },
              {
                clickable: 'false',
                'content-desc': '放心借  按钮',
                focusable: 'true',
              },
            ),
            node(
              'android.view.ViewGroup',
              { left: 110, top: 120, width: 90, height: 72 },
              {
                clickable: 'false',
                'content-desc': '抖音月付  按钮',
                focusable: 'true',
              },
            ),
          ],
        ),
      ],
    );

    const audit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });

    expect(audit.overlays).toEqual([
      expect.objectContaining({
        name: '放心借  按钮',
        nodeId: 'node-0003',
        rect: { left: 20, top: 120, width: 90, height: 72 },
      }),
      expect.objectContaining({
        name: '抖音月付  按钮',
        nodeId: 'node-0004',
        rect: { left: 110, top: 120, width: 90, height: 72 },
      }),
    ]);
  });

  it('ignores full-page clickable wrappers when selecting WebView controls', () => {
    const buildAudit = (clickable: string) => {
      const root = node(
        'android.webkit.WebView',
        { left: 0, top: 0, width: 400, height: 800 },
        {},
        [
          node(
            'android.view.View',
            { left: 0, top: 0, width: 400, height: 800 },
            { clickable },
            [
              node(
                'android.view.View',
                { left: 0, top: 0, width: 400, height: 800 },
                { clickable, 'resource-id': 'root' },
                [
                  node(
                    'android.view.View',
                    { left: 20, top: 100, width: 360, height: 70 },
                    { clickable, 'resource-id': 'fullfill' },
                    [
                      node(
                        'android.widget.TextView',
                        { left: 40, top: 120, width: 120, height: 30 },
                        { text: '安全保障中' },
                      ),
                      node('android.widget.Image', {
                        left: 340,
                        top: 125,
                        width: 16,
                        height: 16,
                      }),
                    ],
                  ),
                  node(
                    'android.widget.Button',
                    { left: 20, top: 200, width: 160, height: 60 },
                    { clickable: 'true', text: '分期还款' },
                  ),
                ],
              ),
            ],
          ),
        ],
      );
      return buildAndroidLiveTreeAudit(root, {
        width: 400,
        height: 800,
      });
    };

    const clickableAudit = buildAudit('true');
    const nonClickableAudit = buildAudit('false');

    expect(clickableAudit.overlays.map((overlay) => overlay.nodeId)).toEqual([
      'node-0004',
      'node-0007',
    ]);
    expect(clickableAudit.overlays.map((overlay) => overlay.rect)).toEqual(
      nonClickableAudit.overlays.map((overlay) => overlay.rect),
    );
  });

  it('does not turn a WebView text label into a control only because clickable changes', () => {
    const buildAudit = (clickable: string) => {
      const root = node(
        'android.webkit.WebView',
        { left: 0, top: 0, width: 400, height: 800 },
        {},
        [
          node(
            'android.widget.TextView',
            { left: 20, top: 100, width: 120, height: 30 },
            { clickable, text: '平台协议更新公告' },
          ),
          node(
            'android.widget.TextView',
            { left: 300, top: 100, width: 40, height: 30 },
            { clickable, text: '查看' },
          ),
          node('android.widget.Image', {
            left: 342,
            top: 105,
            width: 16,
            height: 16,
          }),
        ],
      );
      return buildAndroidLiveTreeAudit(root, {
        width: 400,
        height: 800,
      });
    };

    const clickableAudit = buildAudit('true');
    const nonClickableAudit = buildAudit('false');

    expect(clickableAudit.overlays.map((overlay) => overlay.nodeId)).toEqual([
      'node-0003',
    ]);
    expect(clickableAudit.overlays.map((overlay) => overlay.rect)).toEqual(
      nonClickableAudit.overlays.map((overlay) => overlay.rect),
    );
  });

  it('keeps the same semantic text and image container when clickable changes', () => {
    const buildAudit = (clickable: string) => {
      const root = node(
        'android.webkit.WebView',
        { left: 0, top: 0, width: 400, height: 800 },
        {},
        [
          node(
            'android.view.View',
            { left: 80, top: 100, width: 240, height: 30 },
            { clickable },
            [
              node(
                'android.widget.TextView',
                { left: 80, top: 100, width: 70, height: 30 },
                { text: '将优先从' },
              ),
              node(
                'android.widget.TextView',
                { left: 150, top: 100, width: 100, height: 30 },
                { text: '招商银行' },
              ),
              node(
                'android.widget.TextView',
                { left: 250, top: 100, width: 50, height: 30 },
                { text: '自动扣款' },
              ),
              node('android.widget.Image', {
                left: 302,
                top: 107,
                width: 16,
                height: 16,
              }),
            ],
          ),
        ],
      );
      return buildAndroidLiveTreeAudit(root, {
        width: 400,
        height: 800,
      });
    };

    const clickableAudit = buildAudit('true');
    const nonClickableAudit = buildAudit('false');

    for (const audit of [clickableAudit, nonClickableAudit]) {
      expect(audit.overlays).toEqual([
        expect.objectContaining({
          nodeId: 'node-0002',
          rect: { left: 80, top: 100, width: 240, height: 30 },
          rectSource: 'tree',
        }),
      ]);
    }
  });

  it('selects the smallest complete semantic unit instead of a wrapper with identical content', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 20, top: 100, width: 360, height: 140 },
          {},
          [
            node(
              'android.view.View',
              { left: 60, top: 120, width: 200, height: 80 },
              {},
              [
                node(
                  'android.widget.TextView',
                  { left: 80, top: 140, width: 80, height: 30 },
                  { text: '消费明细' },
                ),
                node('android.widget.Image', {
                  left: 180,
                  top: 140,
                  width: 20,
                  height: 20,
                }),
              ],
            ),
          ],
        ),
      ],
    );

    const audit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });

    expect(audit.overlays).toEqual([
      expect.objectContaining({
        nodeId: 'node-0003',
        rect: { left: 60, top: 120, width: 200, height: 80 },
      }),
    ]);
  });

  it('lifts a semantic unit when its parent contributes additional content', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 20, top: 100, width: 360, height: 120 },
          {},
          [
            node(
              'android.widget.TextView',
              { left: 40, top: 115, width: 100, height: 30 },
              { text: '自动扣款' },
            ),
            node(
              'android.view.View',
              { left: 40, top: 155, width: 220, height: 40 },
              {},
              [
                node(
                  'android.widget.TextView',
                  { left: 40, top: 160, width: 120, height: 30 },
                  { text: '招商银行(2479)' },
                ),
                node('android.widget.Image', {
                  left: 180,
                  top: 165,
                  width: 16,
                  height: 16,
                }),
              ],
            ),
          ],
        ),
      ],
    );

    const audit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });

    expect(audit.overlays).toEqual([
      expect.objectContaining({
        nodeId: 'node-0002',
        rect: { left: 20, top: 100, width: 360, height: 120 },
      }),
    ]);
  });

  it('keeps sibling buttons separate inside a compact semantic container', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 20, top: 100, width: 360, height: 70 },
          {},
          [
            node(
              'android.widget.Button',
              { left: 20, top: 100, width: 170, height: 70 },
              { clickable: 'true', text: '分期还款' },
            ),
            node(
              'android.widget.Button',
              { left: 210, top: 100, width: 170, height: 70 },
              { clickable: 'true', text: '提前还款' },
            ),
          ],
        ),
      ],
    );

    const audit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });

    expect(audit.overlays.map((overlay) => overlay.nodeId)).toEqual([
      'node-0003',
      'node-0004',
    ]);
  });

  it('preserves sibling units through nested stable containers', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 20, top: 100, width: 360, height: 100 },
          { 'resource-id': 'entry-list' },
          [
            node(
              'android.view.View',
              { left: 20, top: 100, width: 360, height: 100 },
              { 'resource-id': 'entry-grid' },
              [
                node(
                  'android.view.View',
                  { left: 20, top: 100, width: 170, height: 100 },
                  { 'resource-id': 'entry-left' },
                  [
                    node(
                      'android.widget.TextView',
                      { left: 60, top: 130, width: 80, height: 30 },
                      { text: '消费明细' },
                    ),
                  ],
                ),
                node(
                  'android.view.View',
                  { left: 210, top: 100, width: 170, height: 100 },
                  { 'resource-id': 'entry-right' },
                  [
                    node(
                      'android.widget.TextView',
                      { left: 250, top: 130, width: 80, height: 30 },
                      { text: '月付金' },
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );

    const audit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });

    expect(audit.overlays.map((overlay) => overlay.nodeId)).toEqual([
      'node-0004',
      'node-0006',
    ]);
  });

  it('keeps a stable business boundary around internal action fragments', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 20, top: 100, width: 360, height: 100 },
          { 'resource-id': 'campaign-card' },
          [
            node(
              'android.view.View',
              { left: 20, top: 100, width: 360, height: 100 },
              {},
              [
                node(
                  'android.view.View',
                  { left: 20, top: 100, width: 280, height: 100 },
                  { clickable: 'true', text: '领取红包' },
                ),
                node(
                  'android.view.View',
                  { left: 300, top: 100, width: 80, height: 100 },
                  { clickable: 'true', text: '下一张' },
                ),
              ],
            ),
          ],
        ),
      ],
    );

    const audit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });

    expect(audit.overlays).toEqual([
      expect.objectContaining({
        nodeId: 'node-0002',
        rect: { left: 20, top: 100, width: 360, height: 100 },
      }),
    ]);
  });

  it('enumerates every node with deterministic structural XPath', () => {
    const enumerated = enumerateAndroidUiTree(auditTree());
    expect(enumerated.nodes.map((entry) => entry.nodeId)).toEqual([
      'node-0001',
      'node-0002',
      'node-0003',
    ]);
    expect(enumerated.nodes.map((entry) => entry.structuralXpath)).toEqual([
      '/android.widget.FrameLayout[1]',
      '/android.widget.FrameLayout[1]/android.widget.Button[1]',
      '/android.widget.FrameLayout[1]/android.view.View[1]',
    ]);
  });

  it('keeps safe nodes pending until a fresh tree validates them', () => {
    const source = buildAndroidLiveTreeAudit(auditTree(), {
      width: 400,
      height: 800,
    });

    expect(source.overlays.map((overlay) => overlay.status)).toEqual([
      'pending',
      'tree-only-positional',
    ]);

    const fresh = buildAndroidLiveTreeAudit(
      auditTree(40),
      { width: 400, height: 800 },
      source.treeNodes,
    );
    expect(fresh.replay).toEqual({
      attempted: 1,
      hits: 1,
      misses: 0,
      wrongMappings: 0,
    });
    expect(fresh.overlays[0]).toMatchObject({
      nodeId: 'node-0002',
      rect: { left: 20, top: 40, width: 120, height: 60 },
      status: 'cache-xpath-hit',
    });
    expect(fresh.overlays[1].status).toBe('tree-only-positional');
  });

  it('carries fresh replay hits to visual overlays mapped to non-interactive nodes', () => {
    const createTree = (top: number) =>
      node(
        'android.widget.FrameLayout',
        { left: 0, top: 0, width: 400, height: 800 },
        {},
        [
          node(
            'android.view.View',
            { left: 20, top, width: 120, height: 60 },
            { 'resource-id': 'stable-lynx-control' },
          ),
        ],
      );
    const source = buildAndroidLiveTreeAudit(createTree(20), {
      width: 400,
      height: 800,
    });
    const freshRoot = createTree(40);
    const fresh = buildAndroidLiveTreeAudit(
      freshRoot,
      { width: 400, height: 800 },
      source.treeNodes,
    );
    const visual = buildAndroidVisualAudit(
      freshRoot,
      { width: 400, height: 800 },
      fresh,
      [
        {
          description: 'stable Lynx control',
          id: 'visual-lynx-control',
          name: 'Lynx control',
          rect: { left: 20, top: 40, width: 120, height: 60 },
          rectSource: 'ai',
        },
      ],
    );

    expect(fresh.overlays).toEqual([]);
    expect(fresh.replay).toEqual({
      attempted: 1,
      hits: 1,
      misses: 0,
      wrongMappings: 0,
    });
    expect(visual.visualElements[0].status).toBe('cache-xpath-hit');
    expect(visual.overlays[0]).toMatchObject({
      nodeId: 'node-0002',
      status: 'cache-xpath-hit',
    });
  });

  it('maps visual controls to tree nodes and keeps missing controls in the denominator', () => {
    const root = auditTree();
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 400, height: 800 },
      treeAudit,
      [
        {
          description: '打开按钮',
          id: 'visual-open',
          name: '打开',
          rect: { left: 10, top: 10, width: 160, height: 100 },
          rectSource: 'manual',
        },
        {
          description: '截图可见但没有 Accessibility 节点的客服入口',
          id: 'visual-service',
          name: '客服',
          rect: { left: 250, top: 40, width: 80, height: 80 },
          rectSource: 'manual',
        },
      ],
    );

    expect(visual.visualElements[0]).toMatchObject({
      mappedNodeId: 'node-0002',
      rect: { left: 10, top: 10, width: 160, height: 100 },
      status: 'pending',
    });
    expect(visual.visualElements[1]).toMatchObject({
      mappedNodeId: null,
      status: 'not-exposed',
    });
    expect(visual.overlays).toHaveLength(2);
    expect(visual.overlays[0]).toMatchObject({
      nodeId: 'node-0002',
      rect: { left: 20, top: 20, width: 120, height: 60 },
      rectSource: 'tree',
    });
    expect(visual.overlays[1]).toMatchObject({
      nodeId: null,
      rect: { left: 250, top: 40, width: 80, height: 80 },
      rectSource: 'manual',
      status: 'not-exposed',
      visualElementId: 'visual-service',
    });
  });

  it('does not map an app visual control to the Android navigation bar background', () => {
    const root = node(
      'android.widget.FrameLayout',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 0, top: 780, width: 400, height: 20 },
          { 'resource-id': 'android:id/navigationBarBackground' },
        ),
      ],
    );
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 400, height: 800 },
      treeAudit,
      [
        {
          description: 'bottom cash promotion button',
          id: 'visual-cash',
          name: 'Claim cash',
          rect: { left: 40, top: 755, width: 160, height: 40 },
          rectSource: 'ai',
        },
      ],
    );

    expect(visual.visualElements[0].mappedNodeId).toBeNull();
    expect(visual.overlays).toEqual([
      expect.objectContaining({
        nodeId: null,
        rect: { left: 40, top: 755, width: 160, height: 40 },
        rectSource: 'ai',
        status: 'not-exposed',
      }),
    ]);
  });

  it('always uses tree bounds when the mapped tree node is much larger', () => {
    const root = node(
      'android.widget.FrameLayout',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node('android.view.View', {
          left: 50,
          top: 50,
          width: 200,
          height: 100,
        }),
      ],
    );
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 400, height: 800 },
      treeAudit,
      [
        {
          description: 'small control inside a tree card',
          id: 'visual-inside-card',
          name: 'Card control',
          rect: { left: 100, top: 80, width: 80, height: 40 },
          rectSource: 'ai',
        },
      ],
    );

    expect(visual.visualElements[0].mappedNodeId).toBe('node-0002');
    expect(visual.overlays[0]).toMatchObject({
      nodeId: 'node-0002',
      rect: { left: 50, top: 50, width: 200, height: 100 },
      rectSource: 'tree',
    });
  });

  it('does not expand an AI-confirmed tree control into descendant overlays', () => {
    const root = node(
      'android.widget.FrameLayout',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 100, top: 500, width: 100, height: 100 },
          { 'resource-id': 'payment-entry' },
          [
            node('android.widget.Image', {
              left: 125,
              top: 510,
              width: 30,
              height: 30,
            }),
            node(
              'android.widget.TextView',
              { left: 110, top: 550, width: 80, height: 20 },
              { text: '月付金' },
            ),
          ],
        ),
      ],
    );
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 400, height: 800 },
      treeAudit,
      [
        {
          description: 'payment entry with an icon and label',
          id: 'visual-payment-entry',
          name: 'Payment entry',
          rect: { left: 105, top: 505, width: 90, height: 75 },
          rectSource: 'ai',
        },
      ],
    );

    expect(visual.visualElements[0].mappedNodeId).toBe('node-0002');
    expect(visual.overlays).toEqual([
      expect.objectContaining({
        nodeId: 'node-0002',
        rect: { left: 100, top: 500, width: 100, height: 100 },
        rectSource: 'tree',
        visualElementId: 'visual-payment-entry',
      }),
    ]);
    expect(
      visual.overlays.every((overlay) => overlay.rectSource === 'tree'),
    ).toBe(true);
  });

  it('prefers a nearby control over a row container when the AI rectangle is slightly shifted', () => {
    const root = node(
      'android.widget.FrameLayout',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 16, top: 610, width: 375, height: 60 },
          { 'resource-id': 'icon-container' },
          [
            node(
              'android.view.View',
              { left: 272, top: 622, width: 66, height: 48 },
              { 'resource-id': 'icon-repayment-assistant' },
            ),
          ],
        ),
      ],
    );
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 400, height: 800 },
      treeAudit,
      [
        {
          description: 'repayment assistant control in the bottom row',
          id: 'visual-repayment-assistant',
          name: 'Repayment assistant',
          rect: { left: 305, top: 621, width: 74, height: 92 },
          rectSource: 'ai',
        },
      ],
    );

    expect(visual.visualElements[0].mappedNodeId).toBe('node-0003');
  });

  it('maps to the same semantic node when only its container clickable flag changes', () => {
    const runAudit = (clickable: string) => {
      const root = node(
        'android.widget.FrameLayout',
        { left: 0, top: 0, width: 400, height: 800 },
        {},
        [
          node(
            'android.view.View',
            { left: 100, top: 100, width: 100, height: 100 },
            { clickable },
            [
              node(
                'android.view.View',
                { left: 110, top: 110, width: 80, height: 80 },
                { 'resource-id': 'stable-lynx-control' },
              ),
            ],
          ),
        ],
      );
      const treeAudit = buildAndroidLiveTreeAudit(root, {
        width: 400,
        height: 800,
      });
      return buildAndroidVisualAudit(
        root,
        { width: 400, height: 800 },
        treeAudit,
        [
          {
            description: 'stable Lynx control',
            id: 'visual-stable-control',
            name: 'Stable control',
            rect: { left: 105, top: 105, width: 90, height: 90 },
            rectSource: 'ai',
          },
        ],
      );
    };

    const clickableAudit = runAudit('true');
    const nonClickableAudit = runAudit('false');

    for (const audit of [clickableAudit, nonClickableAudit]) {
      expect(audit.visualElements[0].mappedNodeId).toBe('node-0003');
      expect(audit.overlays).toEqual([
        expect.objectContaining({
          nodeId: 'node-0003',
          rect: { left: 110, top: 110, width: 80, height: 80 },
          rectSource: 'tree',
        }),
      ]);
    }
  });

  it('prefers the control-sized node over an interactive full-page WebView container', () => {
    const button = node('android.widget.Image', {
      left: 320,
      top: 38,
      width: 28,
      height: 28,
    });
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 0, top: 0, width: 400, height: 800 },
          {
            'resource-id': 'Page_layout_scroll',
            scrollable: 'true',
          },
          [
            node(
              'android.view.View',
              { left: 320, top: 38, width: 71, height: 28 },
              {},
              [button],
            ),
          ],
        ),
      ],
    );
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 400,
      height: 800,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 400, height: 800 },
      treeAudit,
      [
        {
          description: 'top-right customer service icon',
          id: 'visual-service',
          name: 'Customer service',
          rect: { left: 323, top: 40, width: 30, height: 49 },
          rectSource: 'ai',
        },
      ],
    );

    expect(visual.visualElements[0].mappedNodeId).toBe('node-0004');
  });

  it('maps a shifted arrow rectangle to the surrounding semantic control', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 360, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 88, top: 296, width: 183, height: 15 },
          { clickable: 'true' },
          [
            node(
              'android.widget.TextView',
              { left: 89, top: 296, width: 47, height: 15 },
              { text: '将优先从' },
            ),
            node(
              'android.widget.TextView',
              { left: 214, top: 296, width: 48, height: 15 },
              { text: '自动扣款' },
            ),
            node(
              'android.view.View',
              { left: 261, top: 297, width: 10, height: 11 },
              { clickable: 'true' },
              [
                node('android.widget.Image', {
                  left: 261,
                  top: 297,
                  width: 10,
                  height: 11,
                }),
              ],
            ),
          ],
        ),
      ],
    );
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 360,
      height: 800,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 360, height: 800 },
      treeAudit,
      [
        {
          description: '查看或设置自动扣款的按钮',
          id: 'visual-auto-debit',
          name: '自动扣款设置',
          rect: { left: 264, top: 305, width: 18, height: 18 },
          rectSource: 'ai',
        },
      ],
    );

    expect(visual.visualElements[0]).toMatchObject({
      mappedNodeId: 'node-0002',
    });
    expect(visual.overlays[0]).toMatchObject({
      nodeId: 'node-0002',
      rect: { left: 88, top: 296, width: 183, height: 15 },
      rectSource: 'tree',
    });
  });

  it('maps a partial link rectangle to the card containing all semantic labels', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 360, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 21, top: 397, width: 318, height: 55 },
          { clickable: 'true', 'resource-id': 'card-repay' },
          [
            node(
              'android.widget.TextView',
              { left: 36, top: 417, width: 55, height: 15 },
              { text: '全部账单' },
            ),
            node(
              'android.widget.TextView',
              { left: 289, top: 417, width: 25, height: 14 },
              { text: '查看' },
            ),
            node(
              'android.view.View',
              { left: 312, top: 418, width: 12, height: 12 },
              { clickable: 'true' },
              [
                node('android.widget.Image', {
                  left: 312,
                  top: 418,
                  width: 12,
                  height: 12,
                }),
              ],
            ),
          ],
        ),
      ],
    );
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 360,
      height: 800,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 360, height: 800 },
      treeAudit,
      [
        {
          description: '查看全部账单详情的按钮',
          id: 'visual-all-bills',
          name: '查看全部账单',
          rect: { left: 288, top: 423, width: 39, height: 25 },
          rectSource: 'ai',
        },
      ],
    );

    expect(visual.visualElements[0]).toMatchObject({
      mappedNodeId: 'node-0002',
    });
    expect(visual.overlays[0]).toMatchObject({
      nodeId: 'node-0002',
      rect: { left: 21, top: 397, width: 318, height: 55 },
      rectSource: 'tree',
    });
  });

  it('prefers the semantic card container over one matching descendant label', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 360, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 34, top: 468, width: 97, height: 68 },
          { clickable: 'true' },
          [
            node(
              'android.widget.TextView',
              { left: 48, top: 486, width: 69, height: 14 },
              { text: '抖音月付卡' },
            ),
            node(
              'android.widget.TextView',
              { left: 47, top: 506, width: 71, height: 13 },
              { text: '微信上也可用' },
            ),
          ],
        ),
      ],
    );
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 360,
      height: 800,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 360, height: 800 },
      treeAudit,
      [
        {
          description: '查看抖音月付卡详情的区域',
          id: 'visual-monthly-pay-card',
          name: '抖音月付卡',
          rect: { left: 47, top: 484, width: 115, height: 61 },
          rectSource: 'ai',
        },
      ],
    );

    expect(visual.visualElements[0]).toMatchObject({
      mappedNodeId: 'node-0002',
    });
    expect(visual.overlays[0]).toMatchObject({
      nodeId: 'node-0002',
      rect: { left: 34, top: 468, width: 97, height: 68 },
      rectSource: 'tree',
    });
  });

  it('does not expand a semantic match across separate controls in a large ancestor', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 411, height: 882 },
      {},
      [
        node(
          'android.view.View',
          { left: 16, top: 186, width: 380, height: 328 },
          {},
          [
            node(
              'android.widget.TextView',
              { left: 153, top: 254, width: 106, height: 17 },
              { text: '8月6日待还 (元)' },
            ),
            node(
              'android.view.View',
              { left: 145, top: 280, width: 151, height: 39 },
              {},
              [
                node(
                  'android.widget.TextView',
                  { left: 145, top: 280, width: 122, height: 39 },
                  { text: '153.00' },
                ),
                node('android.widget.Image', {
                  left: 270,
                  top: 287,
                  width: 25,
                  height: 25,
                }),
              ],
            ),
            node(
              'android.widget.TextView',
              { left: 105, top: 328, width: 201, height: 16 },
              { text: '将优先从招商银行(2479)自动扣款' },
            ),
            node(
              'android.widget.Button',
              { left: 42, top: 368, width: 157, height: 41 },
              { clickable: 'true', text: '分期还款' },
            ),
          ],
        ),
      ],
    );
    const treeAudit = buildAndroidLiveTreeAudit(root, {
      width: 411,
      height: 882,
    });
    const visual = buildAndroidVisualAudit(
      root,
      { width: 411, height: 882 },
      treeAudit,
      [
        {
          description: '查看8月6日待还账单详情',
          id: 'visual-bill-amount',
          name: '待还金额区域',
          rect: { left: 140, top: 273, width: 259, height: 88 },
          rectSource: 'ai',
        },
      ],
    );

    expect(visual.visualElements[0].mappedNodeId).toBe('node-0005');
    expect(visual.overlays[0]).toMatchObject({
      nodeId: 'node-0005',
      rect: { left: 145, top: 280, width: 122, height: 39 },
      rectSource: 'tree',
    });
  });
});
