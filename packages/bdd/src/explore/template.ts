/**
 * The midscene-bdd dashboard viewer: one self-contained HTML document with
 * vanilla JS, inline CSS, and an inline SVG flow graph. No external assets.
 *
 * Shipped as a TS module (not a .html file) because the rslib bundle:false
 * build only emits compiled .ts sources — a sibling .html asset would never
 * reach dist. `String.raw` keeps backslash sequences in the viewer JS
 * literal. HARD RULES for editing the markup below: no backticks, no
 * dollar-brace interpolation, no literal "</" inside viewer JS strings
 * (build DOM via createElement instead of innerHTML).
 *
 * `renderDashboard` replaces the __EXPLORE_DATA__ placeholder inside the
 * application/json script tag with the serialized ExploreModel.
 */
export const DASHBOARD_TEMPLATE = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>midscene-bdd dashboard</title>
<style>
  :root {
    --bg: #111318;
    --panel: #181b21;
    --panel-2: #1f232b;
    --panel-3: #262b35;
    --border: #2c313b;
    --border-soft: #232830;
    --text: #dde1e8;
    --muted: #8b93a1;
    --accent: #6ea8e0;
    --accent-soft: #6ea8e022;
    --context: #58c08a;   /* Given */
    --action: #5aa2e8;    /* When */
    --outcome: #b48ee8;   /* Then */
    --warn: #e0a35a;
    --bad: #e06a6a;
    --shadow: 0 1px 2px rgba(0,0,0,.35);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    display: flex;
    flex-direction: column;
  }
  code, .mono, .step-text, .kw, .tree-row-name, .docstring {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: #2e3440; border-radius: 6px; border: 2px solid var(--bg);
  }
  ::-webkit-scrollbar-thumb:hover { background: #3a4252; }
  button { transition: background-color .12s ease, border-color .12s ease, color .12s ease; }

  /* ———— header ———— */
  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 16px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, #1b1f27, #171a20);
    box-shadow: var(--shadow);
    position: relative;
    z-index: 5;
  }
  header h1 {
    font-size: 15px; margin: 0; font-weight: 700; white-space: nowrap;
    display: flex; align-items: center; gap: 8px; letter-spacing: .01em;
  }
  header h1::before {
    content: ''; width: 9px; height: 9px; border-radius: 3px;
    background: linear-gradient(135deg, var(--context), var(--accent));
    box-shadow: 0 0 8px #6ea8e066;
  }
  #base-dir { color: var(--muted); font-size: 12px; max-width: 34ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stats { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    border: 1px solid var(--border-soft); border-radius: 999px;
    padding: 1px 9px; font-size: 12px; color: var(--muted); background: var(--panel-2);
  }
  .chip b { color: var(--text); font-weight: 650; }
  #search {
    flex: 1; min-width: 180px; max-width: 420px;
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text); padding: 6px 11px; font-size: 13px; outline: none;
    transition: border-color .12s ease, box-shadow .12s ease;
  }
  #search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  nav {
    display: flex; gap: 2px; margin-left: auto;
    background: var(--panel-2); border: 1px solid var(--border-soft);
    border-radius: 9px; padding: 2px;
  }
  nav button {
    background: transparent; border: 1px solid transparent; border-radius: 7px;
    color: var(--muted); padding: 5px 12px; font-size: 13px; cursor: pointer; font-weight: 550;
  }
  nav button:hover { color: var(--text); }
  nav button.active { background: var(--panel-3); border-color: var(--border); color: var(--text); box-shadow: var(--shadow); }
  nav .pill { background: var(--bad); color: #fff; border-radius: 999px; padding: 0 6px; font-size: 11px; margin-left: 5px; }
  nav .pill.zero { background: var(--border); color: var(--muted); }

  main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  main > section { flex: 1; min-height: 0; }

  /* ———— stories ———— */
  #view-stories { display: flex; }
  #tree {
    width: 360px; min-width: 240px; overflow-y: auto;
    border-right: 1px solid var(--border); background: var(--panel); padding: 8px 0 24px;
  }
  .tree-head {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 12px 5px; cursor: pointer; user-select: none;
    color: var(--text); font-weight: 600; font-size: 13px;
    position: sticky; top: 0; background: var(--panel); z-index: 2;
  }
  .tree-head:hover { background: var(--panel-2); }
  .tree-head .caret { color: var(--muted); width: 12px; font-size: 11px; }
  .tree-head .count { margin-left: auto; color: var(--muted); font-size: 11px; }
  .tree-group.flows-group { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 4px; }
  .tree-row {
    display: flex; align-items: baseline; gap: 7px;
    padding: 4px 12px 4px 31px; cursor: pointer; font-size: 12.5px;
    border-left: 2px solid transparent;
    transition: background-color .1s ease;
  }
  .tree-row:hover { background: var(--panel-2); }
  .tree-row.active { background: #283041; border-left-color: var(--accent); }
  .tree-row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tree-row .mini { color: var(--muted); font-size: 10.5px; white-space: nowrap; }
  .tree-row .mini.tag { color: var(--accent); }
  .tree-empty { color: var(--muted); padding: 12px 16px; font-size: 12.5px; }

  #detail { flex: 1; overflow-y: auto; padding: 20px 28px 60px; }
  .empty { color: var(--muted); padding: 40px; text-align: center; }
  .kicker { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .detail-head h2 { margin: 4px 0 8px; font-size: 19px; font-weight: 650; }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 18px; }
  .loc { color: var(--muted); font-size: 12px; }
  .chip.tag-chip { color: var(--accent); border-color: #31415a; }
  .chip.clickable { cursor: pointer; }
  .chip.clickable:hover { border-color: var(--accent); color: var(--text); }

  .steps-card {
    background: var(--panel);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    padding: 14px 12px;
    box-shadow: var(--shadow);
    max-width: 980px;
  }
  .step { margin: 2px 0; }
  .step-row {
    display: flex; align-items: baseline; gap: 8px;
    padding: 4px 10px; border-radius: 6px;
    transition: background-color .1s ease;
  }
  .step-row:hover { background: var(--panel-2); }
  .step.step-issue > .step-row { background: rgba(224,106,106,.08); }
  .kw { font-weight: 700; white-space: nowrap; }
  .kw-context { color: var(--context); }
  .kw-action  { color: var(--action); }
  .kw-outcome { color: var(--outcome); }
  .kw-unknown { color: var(--muted); }
  .step-text { white-space: pre-wrap; word-break: break-word; }
  .step-badges { display: inline-flex; gap: 4px; margin-left: 10px; flex-shrink: 0; }
  .var-chip {
    background: #1f3550; color: #8fc1f5; border-radius: 4px;
    padding: 0 4px; font-size: 12px;
  }
  .var-chip.bad { background: #4d2330; color: #f59ab1; }
  .muted { color: var(--muted); }
  .badge {
    font-size: 10px; font-weight: 700; letter-spacing: .04em;
    border-radius: 4px; padding: 1px 6px; line-height: 1.5; white-space: nowrap;
  }
  .badge-noai    { background: #3a2f4d; color: #cdb6f5; }
  .badge-agent   { background: #4d3a26; color: #f0c690; }
  .badge-soft    { background: #26404d; color: #90d4f0; }
  .badge-skill   { background: #2c4d36; color: #9af0b8; }
  .badge-capture { background: #2c3a4d; color: #9ec7f0; }
  .issue-note { color: var(--bad); font-size: 12px; padding: 2px 10px 4px 34px; }
  table.dt { border-collapse: collapse; margin: 4px 10px 8px 34px; font-size: 12.5px; }
  table.dt td { border: 1px solid var(--border); padding: 3px 10px; font-family: ui-monospace, Menlo, Consolas, monospace; }
  pre.docstring {
    margin: 4px 10px 8px 34px; padding: 8px 12px; font-size: 12px;
    background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
    white-space: pre-wrap;
  }

  .flow-call { margin: 1px 0 3px 34px; }
  .flow-toggle {
    background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
    color: var(--accent); padding: 3px 10px; font-size: 12px; cursor: pointer; text-align: left;
    font-family: ui-monospace, Menlo, Consolas, monospace;
  }
  .flow-toggle:hover { border-color: var(--accent); }
  .flow-toggle.open { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .flow-body {
    border-left: 2px solid var(--border); margin-left: 8px; padding: 4px 0 2px 10px;
  }

  /* ———— graph ———— */
  #view-graph { display: none; flex-direction: column; }
  #graph-toolbar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 9px 16px; border-bottom: 1px solid var(--border); background: var(--panel);
    font-size: 12.5px; color: var(--muted);
  }
  #graph-toolbar b { color: var(--text); }
  #graph-toolbar label.toggle {
    display: inline-flex; align-items: center; gap: 6px;
    color: var(--text); cursor: pointer; user-select: none; white-space: nowrap;
  }
  #graph-toolbar label.toggle input { accent-color: var(--accent); margin: 0; }
  .btn {
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px;
    color: var(--text); padding: 4px 11px; font-size: 12px; cursor: pointer;
  }
  .btn:hover { border-color: var(--accent); }
  #graph-scroll { flex: 1; overflow: auto; }
  .gband { fill: rgba(255,255,255,.018); stroke: var(--border); stroke-opacity: .55; }
  .gband-label { fill: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .gnode { cursor: pointer; }
  .gnode { transition: opacity .15s ease; }
  .gedge { transition: opacity .15s ease, stroke .15s ease; }
  .gnode rect {
    fill: var(--panel-2); stroke: var(--border); stroke-width: 1.2; rx: 9;
    transition: stroke .12s ease, fill .12s ease;
  }
  .gnode:hover rect { stroke: var(--accent); }
  .gnode.feature rect { fill: #20283a; stroke: #41557a; }
  .gnode.scenario rect { fill: #20283a; stroke: #41557a; stroke-dasharray: 4 3; }
  .gnode.flow rect { fill: #1f3326; stroke: #4a7a55; }
  .gnode.flow.unused rect { stroke: var(--warn); stroke-dasharray: 4 3; fill: #33291f; }
  .gnode.focus rect { stroke: var(--accent); stroke-width: 2.2; fill: #1d3242; }
  .gnode:focus { outline: none; }
  .gnode:focus rect { stroke: var(--accent); stroke-width: 2; }
  .gnode text { fill: var(--text); font-size: 12px; }
  .gnode text.sub { fill: var(--muted); font-size: 10px; }
  /* dependency-cone highlighting: in-cone pops, everything else dims */
  .gnode.dim { opacity: .18; }
  .gnode.cone rect { stroke-width: 1.9; }
  .gnode.pinned rect { stroke: var(--accent); stroke-width: 2.4; }
  .gnode.hot rect { stroke: var(--accent); stroke-width: 2; }
  .gedge { fill: none; stroke: #465061; stroke-opacity: .42; stroke-width: 1.4; }
  .gedge.flowedge { stroke: #4a7a55; stroke-opacity: .7; stroke-width: 1.8; }
  svg.fade-edges .gedge { stroke-opacity: .16; }
  svg.fade-edges .gedge.flowedge { stroke-opacity: .3; }
  .gedge.dim, svg.fade-edges .gedge.dim { stroke-opacity: .07; }
  .gedge.cone, svg.fade-edges .gedge.cone { stroke-opacity: .95; stroke-width: 2.1; }
  .gedge.hot, svg.fade-edges .gedge.hot { stroke: var(--accent); stroke-opacity: 1; stroke-width: 2.4; }
  .gedge-hit { fill: none; stroke: transparent; stroke-width: 12; cursor: pointer; }
  .gedge-label { fill: var(--text); font-size: 11px; pointer-events: none; paint-order: stroke; stroke: var(--bg); stroke-width: 4; }

  /* ———— health ———— */
  #view-health { display: none; overflow-y: auto; padding: 20px 28px 60px; }
  .health-section { margin-bottom: 26px; max-width: 1100px; }
  .health-section h3 { margin: 0 0 8px; font-size: 14px; display: flex; align-items: baseline; gap: 8px; }
  .health-section h3 .count { color: var(--muted); font-size: 12px; font-weight: 400; }
  .health-row {
    display: flex; align-items: baseline; gap: 14px;
    padding: 7px 12px; border: 1px solid var(--border); border-top: none; background: var(--panel);
  }
  .health-row:first-of-type { border-top: 1px solid var(--border); border-radius: 7px 7px 0 0; }
  .health-row:last-of-type { border-radius: 0 0 7px 7px; }
  .health-row:first-of-type:last-of-type { border-radius: 7px; }
  .health-msg { flex: 1; font-size: 13px; }
  .health-loc {
    color: var(--accent); font-size: 12px; text-decoration: none; white-space: nowrap;
    font-family: ui-monospace, Menlo, Consolas, monospace;
  }
  .health-loc:hover { text-decoration: underline; }
  .kind-badge { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 1px 7px; white-space: nowrap; }
  .kind-error { background: #4d2626; color: #f0a3a3; }
  .kind-warn  { background: #4d3f26; color: #f0d490; }
  footer {
    padding: 6px 16px; border-top: 1px solid var(--border);
    color: var(--muted); font-size: 11px; background: var(--panel);
  }
</style>
</head>
<body>
<header>
  <div>
    <h1>midscene-bdd dashboard</h1>
    <div id="base-dir"></div>
  </div>
  <div id="stats" class="stats"></div>
  <input id="search" type="search" placeholder="Search name, tag or step text…  press /" autocomplete="off">
  <nav>
    <button id="tab-stories">Stories</button>
    <button id="tab-graph">Flow graph</button>
    <button id="tab-health">Health<span id="health-count" class="pill"></span></button>
  </nav>
</header>
<main>
  <section id="view-stories">
    <aside id="tree"></aside>
    <div id="detail"></div>
  </section>
  <section id="view-graph">
    <div id="graph-toolbar"></div>
    <div id="graph-scroll"><svg id="graph-svg" xmlns="http://www.w3.org/2000/svg"></svg></div>
  </section>
  <section id="view-health"><div id="health-table"></div></section>
</main>
<footer id="footer"></footer>
<script id="explore-data" type="application/json">__EXPLORE_DATA__</script>
<script>
'use strict';

/* ———————————————— data + indices ———————————————— */

var MODEL = JSON.parse(document.getElementById('explore-data').textContent);

var flowById = Object.create(null);
MODEL.flows.forEach(function (f) { flowById[f.id] = f; });

var scenarioById = Object.create(null);
var featureById = Object.create(null);
var featureOfScenario = Object.create(null);
MODEL.features.forEach(function (feat) {
  featureById[feat.id] = feat;
  feat.scenarios.forEach(function (sc) {
    scenarioById[sc.id] = sc;
    featureOfScenario[sc.id] = feat.id;
  });
});

var edgesTo = Object.create(null);   // flow id -> incoming edges
var edgesFrom = Object.create(null); // owner id -> outgoing edges
MODEL.edges.forEach(function (e) {
  (edgesTo[e.to] = edgesTo[e.to] || []).push(e);
  (edgesFrom[e.from] = edgesFrom[e.from] || []).push(e);
});

// Lowercased search haystack per scenario/flow, built once: name + tags +
// every step text. Search stays instant for hundreds of scenarios.
var haystack = Object.create(null);
function buildHaystack(item) {
  var parts = [item.name].concat(item.tags || []);
  item.steps.forEach(function (s) { parts.push(s.text); });
  return parts.join('\n').toLowerCase();
}
MODEL.features.forEach(function (feat) {
  feat.scenarios.forEach(function (sc) { haystack[sc.id] = buildHaystack(sc); });
});
MODEL.flows.forEach(function (f) { haystack[f.id] = buildHaystack(f); });

/* ———————————————— state + dom helpers ———————————————— */

var state = {
  view: 'stories',
  selectedId: null,
  query: '',
  focusFlowId: null,       // optional subgraph focus (toolbar button on a pinned flow)
  pinnedId: null,          // graph node whose dependency cone is pinned
  graphScenarios: true,    // graph toggle: every scenario vs aggregated features
  graphFadeEdges: true,    // graph toggle: dim edges when the graph is dense
  collapsed: Object.create(null) // feature id (or '__flows__') -> true
};
var rowEls = Object.create(null); // tree row elements by item id

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
function argsSummary(args) {
  var keys = Object.keys(args || {});
  if (keys.length === 0) return 'no args';
  return keys.map(function (k) { return k + ' = "' + args[k] + '"'; }).join(', ');
}

/* ———————————————— header ———————————————— */

function renderHeader() {
  document.getElementById('base-dir').textContent = MODEL.baseDir;
  document.getElementById('base-dir').title = MODEL.baseDir;
  var stats = document.getElementById('stats');
  [
    [MODEL.stats.features, 'features'],
    [MODEL.stats.scenarios, 'scenarios'],
    [MODEL.stats.flows, 'flows'],
    [MODEL.stats.steps, 'steps'],
    [MODEL.stats.edges, 'flow calls']
  ].forEach(function (entry) {
    var chip = el('span', 'chip');
    chip.appendChild(el('b', null, String(entry[0])));
    chip.appendChild(document.createTextNode(entry[1]));
    stats.appendChild(chip);
  });
  var pill = document.getElementById('health-count');
  pill.textContent = String(MODEL.health.length);
  if (MODEL.health.length === 0) pill.className = 'pill zero';
  document.getElementById('footer').textContent =
    'Generated ' + MODEL.generatedAt + ' — static snapshot of the feature files; regenerate with: midscene-bdd dashboard';
}

function setView(view) {
  state.view = view;
  ['stories', 'graph', 'health'].forEach(function (v) {
    document.getElementById('view-' + v).style.display = (v === view) ? 'flex' : 'none';
    document.getElementById('tab-' + v).classList.toggle('active', v === view);
  });
  if (view === 'health') document.getElementById('view-health').style.display = 'block';
  if (view === 'graph') renderGraph();
  if (view === 'health') renderHealth();
}

/* ———————————————— stories: tree ———————————————— */

function matches(id) {
  return !state.query || haystack[id].indexOf(state.query) !== -1;
}

function treeRow(item, kind) {
  var row = el('div', 'tree-row ' + kind + (state.selectedId === item.id ? ' active' : ''));
  rowEls[item.id] = row;
  row.appendChild(el('span', 'tree-row-name', item.name));
  if (kind === 'scenario') {
    if (item.isOutline) row.appendChild(el('span', 'mini', '×' + item.exampleCount));
    item.tags.forEach(function (t) { row.appendChild(el('span', 'mini tag', t)); });
  } else {
    row.appendChild(el('span', 'mini', item.params.length + '→' + item.returns.length));
    row.appendChild(el('span', 'mini', plural(item.callers.length, 'caller')));
  }
  row.title = item.name + '  (' + item.uri + ':' + item.line + ')';
  row.onclick = function () { selectItem(item.id); };
  return row;
}

function treeGroup(key, label, items, kind, extraClass) {
  var group = el('div', 'tree-group' + (extraClass ? ' ' + extraClass : ''));
  var head = el('div', 'tree-head');
  // While searching, force groups with hits open so matches stay visible.
  var open = state.query ? true : !state.collapsed[key];
  head.appendChild(el('span', 'caret', open ? '▾' : '▸'));
  head.appendChild(el('span', null, label));
  head.appendChild(el('span', 'count', String(items.length)));
  head.onclick = function () {
    state.collapsed[key] = !state.collapsed[key];
    renderTree();
  };
  group.appendChild(head);
  if (open) {
    items.forEach(function (item) { group.appendChild(treeRow(item, kind)); });
  }
  return group;
}

function renderTree() {
  var tree = document.getElementById('tree');
  clear(tree);
  rowEls = Object.create(null);
  var anything = false;
  MODEL.features.forEach(function (feat) {
    var visible = feat.scenarios.filter(function (sc) { return matches(sc.id); });
    if (visible.length === 0 && (state.query || feat.scenarios.length === 0)) return;
    anything = true;
    tree.appendChild(treeGroup(feat.id, feat.name, visible, 'scenario'));
  });
  var flowsVisible = MODEL.flows.filter(function (f) { return matches(f.id); });
  if (flowsVisible.length > 0) {
    anything = true;
    tree.appendChild(treeGroup('__flows__', 'Flows', flowsVisible, 'flow', 'flows-group'));
  }
  if (!anything) {
    tree.appendChild(el('div', 'tree-empty', state.query ? 'No matches for "' + state.query + '"' : 'No features found.'));
  }
}

function selectItem(id) {
  state.selectedId = id;
  var featId = featureOfScenario[id];
  if (featId) state.collapsed[featId] = false;
  if (flowById[id]) state.collapsed['__flows__'] = false;
  setView('stories');
  renderTree();
  renderDetail();
  var row = rowEls[id];
  if (row) row.scrollIntoView({ block: 'nearest' });
}

/* ———————————————— stories: detail (lazy, rendered on selection) ———————————————— */

function renderTable(text) {
  var table = el('table', 'dt');
  text.split('\n').forEach(function (lineText) {
    var tr = el('tr');
    var cells = lineText.split('|').slice(1, -1);
    cells.forEach(function (cell) { tr.appendChild(el('td', null, cell.trim())); });
    table.appendChild(tr);
  });
  return table;
}

// One inline-expandable "→ Flow: ..." affordance under a flow-call step.
// "path" is the chain of already-expanded owner/flow ids: cycles render a
// note instead of recursing, and expansion is depth-capped as a backstop.
function renderFlowCall(call, path) {
  var flow = flowById[call.flowId];
  var box = el('div', 'flow-call');
  var btn = el('button', 'flow-toggle');
  var label = '→ Flow: ' + (flow ? flow.name : call.flowId);
  var summary = argsSummary(call.args);
  if (summary !== 'no args') label += '   (' + summary + ')';
  btn.textContent = label;
  btn.title = 'Toggle inline expansion — ' + summary;
  box.appendChild(btn);

  var body = null;
  btn.onclick = function () {
    if (body) { box.removeChild(body); body = null; btn.classList.remove('open'); return; }
    btn.classList.add('open');
    body = el('div', 'flow-body');
    if (!flow) {
      body.appendChild(el('div', 'issue-note', 'Flow not found in this snapshot.'));
    } else if (path.indexOf(call.flowId) !== -1) {
      body.appendChild(el('div', 'issue-note', '↻ cycle — this flow is already expanded above'));
    } else if (path.length > 6) {
      body.appendChild(el('div', 'issue-note', 'Maximum expansion depth reached.'));
    } else {
      flow.steps.forEach(function (s) {
        body.appendChild(renderStep(s, path.concat(call.flowId)));
      });
    }
    box.appendChild(body);
  };
  return box;
}

// Render step text with <var> tokens as styled chips (red when unknown).
function renderStepText(step) {
  var span = el('span', 'step-text');
  var re = new RegExp('<([A-Za-z_][A-Za-z0-9_]*)>', 'g');
  var last = 0;
  var m = re.exec(step.text);
  while (m) {
    if (m.index > last) {
      span.appendChild(document.createTextNode(step.text.slice(last, m.index)));
    }
    var bad = step.varIssues && step.varIssues.indexOf(m[1]) !== -1;
    var chip = el('span', 'var-chip' + (bad ? ' bad' : ''), m[0]);
    chip.title = bad
      ? 'unknown variable — never captured or returned in this scope'
      : 'runtime variable';
    span.appendChild(chip);
    last = m.index + m[0].length;
    m = re.exec(step.text);
  }
  if (last < step.text.length) {
    span.appendChild(document.createTextNode(step.text.slice(last)));
  }
  return span;
}

function renderStep(step, path) {
  var wrap = el('div', 'step' + (step.varIssues ? ' step-issue' : ''));
  var row = el('div', 'step-row');
  row.appendChild(el('span', 'kw kw-' + step.stepType, step.keyword.trim()));
  row.appendChild(renderStepText(step));

  var badges = el('span', 'step-badges');
  if (step.annotations.noAi) badges.appendChild(el('span', 'badge badge-noai', 'NO-AI'));
  if (step.annotations.agent) badges.appendChild(el('span', 'badge badge-agent', 'AGENT'));
  if (step.annotations.soft) badges.appendChild(el('span', 'badge badge-soft', 'SOFT'));
  step.annotations.skills.forEach(function (s) {
    badges.appendChild(el('span', 'badge badge-skill', '$' + s));
  });
  if (step.capture) {
    var cap = el('span', 'badge badge-capture', '⤴ ' + step.capture.varName);
    cap.title = 'captures "' + step.capture.varName + '" — ' + step.capture.description;
    badges.appendChild(cap);
  }
  if (badges.childNodes.length > 0) row.appendChild(badges);
  wrap.appendChild(row);

  if (step.dataTable) wrap.appendChild(renderTable(step.dataTable));
  if (step.docString) wrap.appendChild(el('pre', 'docstring', step.docString));
  if (step.varIssues) {
    wrap.appendChild(el('div', 'issue-note',
      'Unknown variable' + (step.varIssues.length === 1 ? '' : 's') + ': ' +
      step.varIssues.map(function (v) { return '<' + v + '>'; }).join(', ') +
      ' — never captured or returned in this scope'));
  }
  if (step.flowCall) wrap.appendChild(renderFlowCall(step.flowCall, path));
  return wrap;
}

function callerChip(callerId) {
  var label = callerId;
  if (flowById[callerId]) label = 'flow: ' + flowById[callerId].name;
  else if (scenarioById[callerId]) label = scenarioById[callerId].name;
  var chip = el('span', 'chip clickable', label);
  chip.onclick = function () { selectItem(callerId); };
  return chip;
}

function renderDetail() {
  var detail = document.getElementById('detail');
  clear(detail);
  var id = state.selectedId;
  var flow = id ? flowById[id] : null;
  var sc = id ? scenarioById[id] : null;
  var item = flow || sc;
  if (!item) {
    detail.appendChild(el('div', 'empty', 'Select a scenario or flow from the sidebar.'));
    return;
  }

  var head = el('div', 'detail-head');
  head.appendChild(el('div', 'kicker', flow ? 'Flow' : (sc.isOutline ? 'Scenario Outline' : 'Scenario')));
  head.appendChild(el('h2', null, item.name));
  var meta = el('div', 'detail-meta');
  meta.appendChild(el('span', 'loc', item.uri + ':' + item.line));
  (item.tags || []).forEach(function (t) { meta.appendChild(el('span', 'chip tag-chip', t)); });
  if (sc && sc.isOutline) {
    var ex = el('span', 'chip', plural(sc.exampleCount, 'example row'));
    ex.title = 'Steps below show the first Examples row expansion';
    meta.appendChild(ex);
  }
  if (flow) {
    meta.appendChild(el('span', 'chip', 'params: ' + (flow.params.join(', ') || 'none')));
    meta.appendChild(el('span', 'chip', 'returns: ' + (flow.returns.join(', ') || 'none')));
  }
  meta.appendChild(el('span', 'chip', plural(item.steps.length, 'step')));
  head.appendChild(meta);
  if (flow) {
    var callers = el('div', 'detail-meta');
    callers.appendChild(el('span', 'loc', 'Called by:'));
    if (flow.callers.length === 0) callers.appendChild(el('span', 'chip', 'nobody (unused)'));
    flow.callers.forEach(function (c) { callers.appendChild(callerChip(c)); });
    head.appendChild(callers);
  }
  detail.appendChild(head);

  // Gherkin body framed as a card so the prose reads as one document.
  var stepsCard = el('div', 'steps-card');
  item.steps.forEach(function (step) {
    stepsCard.appendChild(renderStep(step, [item.id]));
  });
  detail.appendChild(stepsCard);
}

/* ———————————————— flow graph (inline SVG, vertical layers) ———————————————— */

var SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag) { return document.createElementNS(SVG_NS, tag); }

// Layer of each flow: 1 for flows only called from scenarios (or unused),
// +1 per flow-to-flow hop. Iterative relaxation with a guard so cycles
// terminate.
function flowLayers() {
  var layer = Object.create(null);
  MODEL.flows.forEach(function (f) { layer[f.id] = 1; });
  var changed = true;
  var guard = 0;
  while (changed && guard < 10) {
    changed = false;
    guard++;
    MODEL.edges.forEach(function (e) {
      if (e.from.indexOf('flow:') !== 0 || layer[e.to] === undefined) return;
      var want = (layer[e.from] || 1) + 1;
      if (want > layer[e.to] && want <= 8) { layer[e.to] = want; changed = true; }
    });
  }
  return layer;
}

function dedupeLinks(raw) {
  var byKey = Object.create(null);
  var out = [];
  raw.forEach(function (l) {
    var key = l.from + '→' + l.to;
    var existing = byKey[key];
    if (existing) { existing.count++; return; }
    l.count = l.count || 1;
    byKey[key] = l;
    out.push(l);
  });
  out.forEach(function (l) {
    if (l.count > 1) l.label = plural(l.count, 'call') + ' — ' + l.label;
  });
  return out;
}

// The whole dependency picture, top to bottom: layer 0 = the dependents
// (every scenario individually, or aggregated feature nodes when the
// "Show every scenario" toggle is off), flows by call depth below. Nodes
// get an explicit "order" so the layout never re-sorts (scenarios keep
// feature/document order; flows keep the model's name order).
function buildFullGraph(nodes, rawLinks) {
  var layers = flowLayers();
  var hiddenCallers = 0;
  var order = 0;
  if (state.graphScenarios) {
    MODEL.features.forEach(function (feat) {
      feat.scenarios.forEach(function (sc) {
        var outs = edgesFrom[sc.id] || [];
        if (outs.length === 0) { hiddenCallers++; return; }
        nodes.push({
          id: sc.id, kind: 'scenario', layer: 0, order: order++, small: true,
          label: sc.name, sub: feat.name
        });
        outs.forEach(function (e) {
          rawLinks.push({ from: sc.id, to: e.to, label: argsSummary(e.args) });
        });
      });
    });
  } else {
    var featureCalls = Object.create(null); // feature id -> flow id -> count
    MODEL.edges.forEach(function (e) {
      if (e.from.indexOf('scenario:') !== 0) return;
      var featId = featureOfScenario[e.from];
      if (!featId) return;
      var agg = featureCalls[featId] || (featureCalls[featId] = Object.create(null));
      agg[e.to] = (agg[e.to] || 0) + 1;
    });
    MODEL.features.forEach(function (feat) {
      var agg = featureCalls[feat.id];
      if (!agg) { hiddenCallers++; return; }
      nodes.push({
        id: feat.id, kind: 'feature', layer: 0, order: order++, label: feat.name,
        sub: plural(feat.scenarios.length, 'scenario')
      });
      Object.keys(agg).sort().forEach(function (flowId) {
        rawLinks.push({ from: feat.id, to: flowId, label: plural(agg[flowId], 'call'), count: agg[flowId] });
      });
    });
  }
  MODEL.flows.forEach(function (f) {
    nodes.push({
      id: f.id, kind: 'flow', layer: layers[f.id], order: order++, label: f.name,
      sub: plural(f.params.length, 'param') + ' · ' + plural(f.returns.length, 'return'),
      unused: (edgesTo[f.id] || []).length === 0
    });
  });
  MODEL.edges.forEach(function (e) {
    if (e.from.indexOf('flow:') !== 0) return;
    rawLinks.push({ from: e.from, to: e.to, label: argsSummary(e.args) });
  });
  return hiddenCallers;
}

// Optional focus subgraph (toolbar button on a pinned flow): the flow's
// direct callers above, the flow, then its transitive callees below.
function buildFocusGraph(nodes, rawLinks) {
  var fid = state.focusFlowId;
  var focus = flowById[fid];
  var seen = Object.create(null);
  var order = 0;
  seen[fid] = true;
  nodes.push({
    id: fid, kind: 'flow', layer: 1, order: order++, label: focus.name,
    sub: plural(focus.params.length, 'param') + ' · ' + plural(focus.returns.length, 'return'),
    focus: true
  });
  (edgesTo[fid] || []).forEach(function (e) {
    if (!seen[e.from]) {
      seen[e.from] = true;
      var isFlow = e.from.indexOf('flow:') === 0;
      var caller = isFlow ? flowById[e.from] : scenarioById[e.from];
      var sub = '';
      if (!isFlow && featureOfScenario[e.from]) sub = featureById[featureOfScenario[e.from]].name;
      nodes.push({
        id: e.from, kind: isFlow ? 'flow' : 'scenario', layer: 0, order: order++,
        small: !isFlow, label: caller ? caller.name : e.from, sub: sub
      });
    }
    rawLinks.push({ from: e.from, to: fid, label: argsSummary(e.args) });
  });
  var frontier = [fid];
  var layer = 2;
  while (frontier.length > 0 && layer < 6) {
    var next = [];
    frontier.forEach(function (src) {
      (edgesFrom[src] || []).forEach(function (e) {
        if (e.to.indexOf('flow:') !== 0) return;
        if (!seen[e.to]) {
          seen[e.to] = true;
          var callee = flowById[e.to];
          nodes.push({
            id: e.to, kind: 'flow', layer: layer, order: order++,
            label: callee ? callee.name : e.to,
            sub: callee ? plural(callee.params.length, 'param') + ' · ' + plural(callee.returns.length, 'return') : ''
          });
          next.push(e.to);
        }
        rawLinks.push({ from: src, to: e.to, label: argsSummary(e.args) });
      });
    });
    frontier = next;
    layer++;
  }
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/* ———— dependency cone ———— */

// Transitive closure of one node over the DRAWN graph: ancestors (everything
// that depends on it, via reverse BFS) plus descendants (everything it
// depends on, via forward BFS). Returns the in-cone node-id set and the
// in-cone link-index set. Visited-link marking makes cycles terminate.
function computeCone(rootId, links) {
  var byTo = Object.create(null);
  var byFrom = Object.create(null);
  links.forEach(function (l, i) {
    (byTo[l.to] = byTo[l.to] || []).push(i);
    (byFrom[l.from] = byFrom[l.from] || []).push(i);
  });
  var nodesIn = Object.create(null);
  var linksIn = Object.create(null);
  nodesIn[rootId] = true;
  var stack = [rootId];
  while (stack.length > 0) {  // ancestors
    var cur = stack.pop();
    (byTo[cur] || []).forEach(function (i) {
      if (linksIn[i]) return;
      linksIn[i] = true;
      var from = links[i].from;
      if (!nodesIn[from]) { nodesIn[from] = true; stack.push(from); }
    });
  }
  stack = [rootId];
  while (stack.length > 0) {  // descendants
    var cur2 = stack.pop();
    (byFrom[cur2] || []).forEach(function (i) {
      if (linksIn[i]) return;
      linksIn[i] = true;
      var to = links[i].to;
      if (!nodesIn[to]) { nodesIn[to] = true; stack.push(to); }
    });
  }
  return { rootId: rootId, nodes: nodesIn, links: linksIn };
}

// Live handles to the last-drawn graph (cone highlighting re-styles in
// place instead of re-rendering, so scroll position is preserved).
var graphRefs = null;

function applyCone(cone) {
  if (!graphRefs) return;
  graphRefs.nodes.forEach(function (n) {
    var g = graphRefs.groupById[n.id];
    if (!g) return;
    g.classList.toggle('cone', !!cone && !!cone.nodes[n.id]);
    g.classList.toggle('dim', !!cone && !cone.nodes[n.id]);
    g.classList.toggle('pinned', !!cone && cone.rootId === n.id && state.pinnedId === n.id);
  });
  graphRefs.links.forEach(function (l, i) {
    var rec = graphRefs.edgeRecs[i];
    if (!rec) return;
    rec.classList.toggle('cone', !!cone && !!cone.links[i]);
    rec.classList.toggle('dim', !!cone && !cone.links[i]);
  });
}

function setPinned(id) {
  state.pinnedId = id;
  applyCone(id && graphRefs ? computeCone(id, graphRefs.links) : null);
  renderGraphToolbar();
}

// Jump to the Stories view for a graph node (features open their first
// scenario).
function openNode(node) {
  if (node.kind === 'feature') {
    var feat = featureById[node.id];
    if (feat && feat.scenarios.length > 0) selectItem(feat.scenarios[0].id);
    return;
  }
  selectItem(node.id);
}

/* ———— vertical layered layout ———— */

var GRAPH_TARGET_W = 1600; // wrap wide layers to roughly this canvas width
var NODE_W = 240;
var NODE_H = 46;
var NODE_H_SMALL = 32;
var H_GAP = 48;
var V_GAP = 22;
var BAND_LABEL_H = 30;
var BAND_GAP = 56;
var PAD = 28;

// Grid-packs each layer into rows of up to perRow nodes inside a labeled
// band, then draws bands, edges (source bottom-center → target top-center,
// arrowheads pointing down) and nodes. Returns live handles for cone
// re-styling.
function layoutVertical(svg, nodes, links, layerLabels) {
  var byLayer = [];
  nodes.forEach(function (n) {
    (byLayer[n.layer] = byLayer[n.layer] || []).push(n);
  });
  var perRow = Math.max(1, Math.floor((GRAPH_TARGET_W - PAD * 2 + H_GAP) / (NODE_W + H_GAP)));
  var widestRow = 1;
  byLayer.forEach(function (list) {
    if (list) widestRow = Math.max(widestRow, Math.min(list.length, perRow));
  });
  var width = PAD * 2 + widestRow * (NODE_W + H_GAP) - H_GAP;

  var bands = [];
  var y = PAD;
  byLayer.forEach(function (list, li) {
    if (!list || list.length === 0) return;
    list.sort(function (a, b) { return a.order - b.order; });
    var layerH = NODE_H_SMALL;
    list.forEach(function (n) {
      n.h = n.small ? NODE_H_SMALL : NODE_H;
      if (n.h > layerH) layerH = n.h;
    });
    var contentTop = y + BAND_LABEL_H;
    list.forEach(function (n, i) {
      n.x = PAD + (i % perRow) * (NODE_W + H_GAP);
      n.y = contentTop + Math.floor(i / perRow) * (layerH + V_GAP);
    });
    var rows = Math.ceil(list.length / perRow);
    var bottom = contentTop + rows * (layerH + V_GAP) - V_GAP + 12;
    bands.push({
      top: y, bottom: bottom,
      label: (layerLabels[li] || 'LAYER ' + li) + ' · ' + list.length
    });
    y = bottom + BAND_GAP;
  });
  var height = y - BAND_GAP + PAD;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));

  // Band backgrounds + labels (painted lowest).
  bands.forEach(function (b) {
    var rect = svgEl('rect');
    rect.setAttribute('class', 'gband');
    rect.setAttribute('x', String(PAD / 2));
    rect.setAttribute('y', String(b.top - 8));
    rect.setAttribute('width', String(width - PAD));
    rect.setAttribute('height', String(b.bottom - b.top + 8));
    rect.setAttribute('rx', '10');
    svg.appendChild(rect);
    var label = svgEl('text');
    label.setAttribute('class', 'gband-label');
    label.setAttribute('x', String(PAD));
    label.setAttribute('y', String(b.top + 11));
    label.textContent = b.label;
    svg.appendChild(label);
  });

  var defs = svgEl('defs');
  var marker = svgEl('marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '7');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('orient', 'auto-start-reverse');
  var arrowPath = svgEl('path');
  arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  arrowPath.setAttribute('fill', '#5f6b80');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  var nodeById = Object.create(null);
  var groupById = Object.create(null);
  nodes.forEach(function (n) { nodeById[n.id] = n; });

  // Edges first so nodes paint on top of them. edgeRecs is index-aligned
  // with links so applyCone can address edges by link index.
  var edgeRecs = [];
  links.forEach(function (l, i) {
    var s = nodeById[l.from];
    var t = nodeById[l.to];
    edgeRecs[i] = null;
    if (!s || !t) return;
    var x1 = s.x + NODE_W / 2;
    var y1 = s.y + s.h;
    var x2 = t.x + NODE_W / 2;
    var y2 = t.y;
    var d;
    if (y2 > y1) {
      var my = (y1 + y2) / 2;
      d = 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + my + ', ' + x2 + ' ' + my + ', ' + x2 + ' ' + y2;
    } else {
      // Back/upward edge (cycle): swing out to the left of both nodes.
      var xo = Math.min(s.x, t.x) - 60;
      d = 'M ' + x1 + ' ' + y1 + ' C ' + xo + ' ' + (y1 + 36) + ', ' + xo + ' ' + (y2 - 36) + ', ' + x2 + ' ' + y2;
    }
    var path = svgEl('path');
    // Flow→flow composition edges read differently from caller→flow usage.
    var isFlowEdge =
      l.from.indexOf('flow:') === 0 && l.to.indexOf('flow:') === 0;
    path.setAttribute('class', 'gedge' + (isFlowEdge ? ' flowedge' : ''));
    path.setAttribute('d', d);
    path.setAttribute('marker-end', 'url(#arrow)');
    var title = svgEl('title');
    title.textContent = (s.label + '  →  ' + t.label + '\n' + l.label);
    path.appendChild(title);
    // Invisible fat twin so the thin edge is easy to hover.
    var hit = svgEl('path');
    hit.setAttribute('class', 'gedge-hit');
    hit.setAttribute('d', d);
    var labelText = svgEl('text');
    labelText.setAttribute('class', 'gedge-label');
    labelText.setAttribute('x', String((x1 + x2) / 2));
    labelText.setAttribute('y', String((y1 + y2) / 2 - 5));
    labelText.setAttribute('text-anchor', 'middle');
    labelText.style.display = 'none';
    labelText.textContent = truncate(l.label, 48);
    function setHot(on) {
      path.classList.toggle('hot', on);
      labelText.style.display = on ? '' : 'none';
      if (groupById[s.id]) groupById[s.id].classList.toggle('hot', on);
      if (groupById[t.id]) groupById[t.id].classList.toggle('hot', on);
    }
    hit.onmouseenter = function () { setHot(true); };
    hit.onmouseleave = function () { setHot(false); };
    svg.appendChild(path);
    svg.appendChild(hit);
    svg.appendChild(labelText);
    edgeRecs[i] = path;
  });

  var KIND_NAMES = { feature: 'Feature', scenario: 'Scenario', flow: 'Flow' };
  nodes.forEach(function (n) {
    var g = svgEl('g');
    g.setAttribute('class', 'gnode ' + n.kind + (n.focus ? ' focus' : '') + (n.unused ? ' unused' : ''));
    g.setAttribute('transform', 'translate(' + n.x + ' ' + n.y + ')');
    var rect = svgEl('rect');
    rect.setAttribute('width', String(NODE_W));
    rect.setAttribute('height', String(n.h));
    rect.setAttribute('rx', n.small ? '7' : '9');
    g.appendChild(rect);
    var label = svgEl('text');
    label.setAttribute('x', '11');
    label.setAttribute('y', n.small ? '20' : '19');
    label.textContent = truncate(n.label, 32);
    g.appendChild(label);
    if (!n.small) {
      var sub = svgEl('text');
      sub.setAttribute('class', 'sub');
      sub.setAttribute('x', '11');
      sub.setAttribute('y', '36');
      sub.textContent = truncate((n.unused ? 'UNUSED · ' : '') + (n.sub || ''), 40);
      g.appendChild(sub);
    }
    var title = svgEl('title');
    title.textContent = n.label + (n.sub ? '\n' + n.sub : '') + (n.unused ? '\n(unused)' : '');
    g.appendChild(title);
    // Keyboard + assistive-tech reachable (SVG groups are invisible to the
    // accessibility tree without an explicit role). Enter/Space = click.
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label',
      (KIND_NAMES[n.kind] || n.kind) + ': ' + n.label + (n.sub ? ' — ' + n.sub : ''));
    // Click pins/unpins the dependency cone; hover previews it while
    // nothing is pinned; double-click jumps to Stories.
    g.onclick = function (ev) {
      ev.stopPropagation();
      setPinned(state.pinnedId === n.id ? null : n.id);
    };
    g.ondblclick = function (ev) {
      ev.stopPropagation();
      openNode(n);
    };
    g.onmouseenter = function () {
      if (!state.pinnedId) applyCone(computeCone(n.id, links));
    };
    g.onmouseleave = function () {
      if (!state.pinnedId) applyCone(null);
    };
    g.onkeydown = function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        setPinned(state.pinnedId === n.id ? null : n.id);
      }
    };
    groupById[n.id] = g;
    svg.appendChild(g);
  });

  return { nodes: nodes, links: links, groupById: groupById, edgeRecs: edgeRecs };
}

/* ———— graph toolbar + entry point ———— */

function toggleControl(labelText, key) {
  var label = el('label', 'toggle');
  var input = el('input');
  input.type = 'checkbox';
  input.checked = !!state[key];
  input.onchange = function () {
    state[key] = input.checked;
    state.pinnedId = null; // the pinned node may not exist in the new graph
    renderGraph();
  };
  label.appendChild(input);
  label.appendChild(document.createTextNode(labelText));
  return label;
}

function renderGraphToolbar() {
  var toolbar = document.getElementById('graph-toolbar');
  clear(toolbar);
  var focused = state.focusFlowId && flowById[state.focusFlowId];

  if (focused) {
    toolbar.appendChild(el('span', null, 'Focused on'));
    toolbar.appendChild(el('b', null, focused.name));
    var clearBtn = el('button', 'btn', 'Clear focus');
    clearBtn.onclick = function () {
      state.focusFlowId = null;
      state.pinnedId = null;
      renderGraph();
    };
    toolbar.appendChild(clearBtn);
  } else {
    toolbar.appendChild(toggleControl('Show every scenario', 'graphScenarios'));
    toolbar.appendChild(toggleControl('Fit edges (dim when dense)', 'graphFadeEdges'));
  }

  if (graphRefs) {
    toolbar.appendChild(el('span', null,
      plural(graphRefs.nodes.length, 'node') + ' · ' + plural(graphRefs.links.length, 'edge')));
    if (graphRefs.hiddenNote) toolbar.appendChild(el('span', null, graphRefs.hiddenNote));
  }

  var pinnedNode = null;
  if (state.pinnedId && graphRefs) {
    pinnedNode = graphRefs.nodes.filter(function (n) { return n.id === state.pinnedId; })[0];
  }
  if (pinnedNode) {
    toolbar.appendChild(el('span', null, 'Pinned:'));
    toolbar.appendChild(el('b', null, truncate(pinnedNode.label, 48)));
    var openBtn = el('button', 'btn', 'Open in Stories');
    var openTarget = pinnedNode;
    openBtn.onclick = function () { openNode(openTarget); };
    toolbar.appendChild(openBtn);
    if (pinnedNode.kind === 'flow' && !focused) {
      var focusBtn = el('button', 'btn', 'Focus subgraph');
      var focusTarget = pinnedNode.id;
      focusBtn.onclick = function () {
        state.focusFlowId = focusTarget;
        state.pinnedId = null;
        renderGraph();
      };
      toolbar.appendChild(focusBtn);
    }
    var unpinBtn = el('button', 'btn', 'Unpin');
    unpinBtn.onclick = function () { setPinned(null); };
    toolbar.appendChild(unpinBtn);
  } else {
    toolbar.appendChild(el('span', null,
      'Hover a node to preview its dependency cone; click to pin it. Double-click opens in Stories.'));
  }
}

function renderGraph() {
  var svg = document.getElementById('graph-svg');
  clear(svg);
  graphRefs = null;
  var nodes = [];
  var rawLinks = [];
  var layerLabels = [];
  var hiddenNote = '';

  if (state.focusFlowId && flowById[state.focusFlowId]) {
    buildFocusGraph(nodes, rawLinks);
    layerLabels = ['CALLERS', 'FOCUSED FLOW', 'CALLEES', 'CALLEES · DEPTH 2', 'CALLEES · DEPTH 3', 'CALLEES · DEPTH 4'];
  } else {
    var hidden = buildFullGraph(nodes, rawLinks);
    layerLabels = [
      state.graphScenarios ? 'SCENARIOS' : 'FEATURES',
      'FLOWS', 'NESTED FLOWS · DEPTH 2', 'NESTED FLOWS · DEPTH 3',
      'NESTED FLOWS · DEPTH 4', 'NESTED FLOWS · DEPTH 5'
    ];
    if (hidden > 0) {
      hiddenNote = hidden + (state.graphScenarios ? ' scenarios' : ' features') + ' without flow calls hidden';
    }
  }

  if (nodes.length === 0) {
    renderGraphToolbar();
    document.getElementById('graph-toolbar')
      .appendChild(el('b', null, 'No flows or flow calls to draw.'));
    return;
  }

  var links = dedupeLinks(rawLinks);
  graphRefs = layoutVertical(svg, nodes, links, layerLabels);
  graphRefs.hiddenNote = hiddenNote;

  // Optional readability aid for dense suites: fade the edge layer.
  svg.classList.toggle('fade-edges', !!state.graphFadeEdges && links.length > 150);

  // Clicking empty canvas unpins (node clicks stop propagation).
  svg.onclick = function () { if (state.pinnedId) setPinned(null); };

  // Restore a still-valid pin across re-renders; otherwise drop it.
  if (state.pinnedId && graphRefs.groupById[state.pinnedId]) {
    applyCone(computeCone(state.pinnedId, links));
  } else {
    state.pinnedId = null;
  }
  renderGraphToolbar();
}

/* ———————————————— health ———————————————— */

var KIND_META = {
  'ambiguous-flow-match': { label: 'Ambiguous flow matches', cls: 'kind-error' },
  'unknown-flow-sugar': { label: 'Unknown flow references', cls: 'kind-error' },
  'flow-depth': { label: 'Flow call depth exceeded', cls: 'kind-error' },
  'unknown-var': { label: 'Unknown variables', cls: 'kind-error' },
  'malformed-remember': { label: 'Malformed remember statements', cls: 'kind-error' },
  'missing-skill': { label: 'Missing skills', cls: 'kind-warn' },
  'unused-flow': { label: 'Unused flows', cls: 'kind-warn' }
};
var KIND_ORDER = [
  'ambiguous-flow-match', 'unknown-flow-sugar', 'flow-depth',
  'unknown-var', 'malformed-remember', 'missing-skill', 'unused-flow'
];

// Best effort: jump to the scenario/flow that contains the finding's line.
function jumpToHealth(h) {
  var best = null;
  function consider(item) {
    if (item.uri !== h.uri) return;
    if (h.line !== undefined && item.line > h.line) return;
    if (!best || item.line > best.line) best = item;
  }
  MODEL.flows.forEach(consider);
  MODEL.features.forEach(function (feat) { feat.scenarios.forEach(consider); });
  if (best) { selectItem(best.id); return; }
  var feat = MODEL.features.filter(function (f) { return f.relPath === h.uri; })[0];
  if (feat && feat.scenarios.length > 0) selectItem(feat.scenarios[0].id);
}

function renderHealth() {
  var box = document.getElementById('health-table');
  clear(box);
  if (MODEL.health.length === 0) {
    box.appendChild(el('div', 'empty', 'No findings — the suite looks healthy.'));
    return;
  }
  KIND_ORDER.forEach(function (kind) {
    var items = MODEL.health.filter(function (h) { return h.kind === kind; });
    if (items.length === 0) return;
    var meta = KIND_META[kind];
    var section = el('div', 'health-section');
    var h3 = el('h3');
    h3.appendChild(el('span', 'kind-badge ' + meta.cls, kind));
    h3.appendChild(el('span', null, meta.label));
    h3.appendChild(el('span', 'count', String(items.length)));
    section.appendChild(h3);
    items.forEach(function (h) {
      var row = el('div', 'health-row');
      row.appendChild(el('span', 'health-msg', h.message));
      if (h.uri) {
        var loc = el('a', 'health-loc', h.uri + (h.line ? ':' + h.line : ''));
        loc.href = '#';
        loc.title = 'Open in Stories';
        loc.onclick = function (ev) { ev.preventDefault(); jumpToHealth(h); };
        row.appendChild(loc);
      }
      section.appendChild(row);
    });
    box.appendChild(section);
  });
}

/* ———————————————— search + keyboard ———————————————— */

var searchInput = document.getElementById('search');
searchInput.addEventListener('input', function () {
  state.query = searchInput.value.trim().toLowerCase();
  renderTree();
});
document.addEventListener('keydown', function (ev) {
  var target = ev.target;
  var typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (ev.key === '/' && !typing) {
    ev.preventDefault();
    setView('stories');
    searchInput.focus();
    searchInput.select();
  }
  if (ev.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    state.query = '';
    renderTree();
    searchInput.blur();
  }
});

/* ———————————————— init ———————————————— */

renderHeader();
['stories', 'graph', 'health'].forEach(function (v) {
  document.getElementById('tab-' + v).onclick = function () { setView(v); };
});
var firstFeature = MODEL.features.filter(function (f) { return f.scenarios.length > 0; })[0];
if (firstFeature) state.selectedId = firstFeature.scenarios[0].id;
renderTree();
renderDetail();
setView('stories');
</script>
</body>
</html>
`;
