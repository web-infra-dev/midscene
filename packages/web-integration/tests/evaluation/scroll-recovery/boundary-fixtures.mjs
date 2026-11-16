// New layouts authored before the confirmation run; no regression card builder.
export const cases = [
  {
    id: 'invoice-matrix',
    family: 'right',
    prompt:
      'In the invoice comparison table, find the Export audit button and click it. Do not click another button.',
  },
  {
    id: 'shipment-board',
    family: 'left',
    prompt:
      'Find the Priority shipment lane and click Approve batch. Do not approve another shipment.',
  },
  {
    id: 'expense-ledger',
    family: 'left',
    prompt:
      'Find the Original receipt column in the expense ledger and click Download receipt. Do not click a different receipt.',
  },
  {
    id: 'release-timeline',
    family: 'right',
    prompt:
      'Find the Launch milestone on the release timeline and click Open release. Do not open another milestone.',
  },
  {
    id: 'calendar-weeks',
    family: 'right',
    prompt:
      'Find the Release week in the team calendar and click Schedule review. Do not select another week.',
  },
  {
    id: 'permission-matrix',
    family: 'left',
    prompt:
      'Find the Security administrators column and click Review access. Do not review another role.',
  },
  {
    id: 'product-specification',
    family: 'right',
    prompt:
      'Find the Extended warranty section in the product specifications and click Add coverage. Do not select another section.',
  },
  {
    id: 'media-contact-sheet',
    family: 'left',
    prompt:
      'Find the Opening scene in the media strip and click Use scene. Do not select another scene.',
  },
  {
    id: 'warehouse-shelves',
    family: 'right',
    prompt:
      'Find the Cold storage shelf and click Reserve stock. Do not reserve another shelf.',
  },
  {
    id: 'booking-timetable',
    family: 'left',
    prompt:
      'Find the Early departure column in the timetable and click Book departure. Do not book another departure.',
  },
  {
    id: 'code-comparison',
    family: 'right',
    prompt:
      'Find the Production configuration pane and click Inspect configuration. Do not inspect another pane.',
  },
  {
    id: 'customer-cohorts',
    family: 'left',
    prompt:
      'Find the Renewal cohort in the customer analysis and click Export cohort. Do not export another cohort.',
  },
].map((c) => ({ ...c, split: 'held-out', controlled: true }));

function body(id) {
  switch (id) {
    case 'invoice-matrix':
      return `<h1>Invoice reconciliation</h1><p>Compare vendor invoices across departments.</p><div id="target"><table style="width:3100px;table-layout:fixed;border-collapse:collapse"><thead><tr>${Array.from({ length: 12 }, (_, i) => `<th>Department ${i + 1}</th>`).join('')}</tr></thead><tbody><tr>${Array.from({ length: 12 }, (_, i) => `<td><h2>${i === 11 ? 'Compliance audit' : `Invoice ${i + 1}`}</h2><p>Approved amount</p><strong>$${(i + 2) * 1234}</strong><p>Reconciled</p>${i === 11 ? '<button data-target="true">Export audit</button>' : '<button data-target="false">View invoice</button>'}</td>`).join('')}</tr></tbody></table></div>`;
    case 'shipment-board':
      return `<h1>Dispatch operations</h1><p>Board / Warehouse west / Active batches</p><div id="target"><div style="display:flex;gap:18px;width:max-content;padding:18px">${Array.from({ length: 8 }, (_, i) => `<article style="width:360px;flex-shrink:0;border-top:8px solid ${i === 0 ? '#963d60' : '#54827a'};background:#f6f3ec;padding:22px"><h2>${i === 0 ? 'Priority shipment' : `Regional lane ${i}`}</h2><p>Warehouse west</p><p>Batch status: ready</p><p>Tracking details verified</p><button data-target="${i === 0}">${i === 0 ? 'Approve batch' : 'Open tracking'}</button></article>`).join('')}</div></div>`;
    case 'expense-ledger':
      return `<h1>Travel expense ledger</h1><p>Trip 8472 — reimbursement documents</p><div id="target"><div style="display:grid;grid-template-columns:repeat(10,300px);width:3000px">${Array.from({ length: 10 }, (_, i) => `<section style="padding:26px;border-right:1px solid #ccc;background:${i % 2 ? '#f0f5f8' : 'white'}"><small>Attachment ${i + 1}</small><h2>${i === 0 ? 'Original receipt' : `Supporting file ${i}`}</h2><p>Travel expense</p><p>Verified by Finance</p><button data-target="${i === 0}">${i === 0 ? 'Download receipt' : 'View attachment'}</button></section>`).join('')}</div></div>`;
    case 'release-timeline':
      return `<h1>Release coordination</h1><p>Project Atlas / Delivery timeline</p><div id="target"><ol style="display:flex;gap:30px;width:max-content;list-style:none;padding:30px">${Array.from({ length: 8 }, (_, i) => `<li style="width:350px;flex-shrink:0;border-top:4px solid #626da1;padding:18px"><small>Milestone ${i + 1}</small><h2>${i === 7 ? 'Launch' : `Review stage ${i + 1}`}</h2><p>Owner: Delivery team</p><p>Readiness: confirmed</p><button data-target="${i === 7}">${i === 7 ? 'Open release' : 'Open review'}</button></li>`).join('')}</ol></div>`;
    case 'calendar-weeks':
      return `<h1>Team calendar</h1><p>Weekly planning / July–September</p><div id="target"><div style="display:grid;grid-template-columns:repeat(9,340px);width:3060px">${Array.from({ length: 9 }, (_, i) => `<section style="border:1px solid #bbc;padding:20px"><h2>${i === 8 ? 'Release week' : `Week ${i + 1}`}</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><p>Mon: Planning</p><p>Tue: Design</p><p>Wed: Review</p><p>Thu: Delivery</p></div><button data-target="${i === 8}">${i === 8 ? 'Schedule review' : 'Open week'}</button></section>`).join('')}</div></div>`;
    case 'permission-matrix':
      return `<h1>Access permissions</h1><p>Roles and resource scopes</p><div id="target"><table style="width:3200px;table-layout:fixed"><thead><tr>${Array.from({ length: 10 }, (_, i) => `<th>${i === 0 ? 'Security administrators' : `Project role ${i}`}</th>`).join('')}</tr></thead><tbody><tr>${Array.from({ length: 10 }, (_, i) => `<td>Audit logs: ${i === 0 ? 'Allowed' : 'Limited'}<br/>Policy editing: Restricted<br/><button data-target="${i === 0}">${i === 0 ? 'Review access' : 'View role'}</button></td>`).join('')}</tr></tbody></table></div>`;
    case 'product-specification':
      return `<h1>Equipment specifications</h1><p>Compare equipment options</p><div id="target"><dl style="display:flex;width:3300px;margin:0">${Array.from({ length: 10 }, (_, i) => `<div style="width:330px;flex-shrink:0;padding:24px;background:${i % 2 ? '#e8eef4' : '#fff'}"><dt style="font-weight:bold">${i === 9 ? 'Extended warranty' : `Specification ${i + 1}`}</dt><dd style="margin:18px 0">${i === 9 ? 'Three years of service' : 'Standard equipment detail'}</dd><dd style="margin:0"><button data-target="${i === 9}">${i === 9 ? 'Add coverage' : 'Read detail'}</button></dd></div>`).join('')}</dl></div>`;
    case 'media-contact-sheet':
      return `<h1>Story editor</h1><p>Choose footage for the opening sequence</p><div id="target"><div style="display:flex;gap:12px;width:3240px;padding:20px">${Array.from({ length: 8 }, (_, i) => `<figure style="margin:0;width:388px;flex-shrink:0"><div style="height:130px;background:linear-gradient(135deg,${i === 0 ? '#64745a,#d3c5a0' : '#57738c,#bbcedc'});display:grid;place-items:center">Scene ${i + 1}</div><figcaption><h2>${i === 0 ? 'Opening scene' : `Transition ${i}`}</h2><p>00:${String(i * 12).padStart(2, '0')} / Wide shot</p><button data-target="${i === 0}">${i === 0 ? 'Use scene' : 'Preview clip'}</button></figcaption></figure>`).join('')}</div></div>`;
    case 'warehouse-shelves':
      return `<h1>Warehouse inventory</h1><p>Building C / available stock</p><div id="target"><div style="display:grid;grid-template-columns:repeat(10,310px);width:3100px">${Array.from({ length: 10 }, (_, i) => `<fieldset style="margin:15px;padding:20px"><legend>${i === 9 ? 'Cold storage' : `Shelf ${i + 1}`}</legend><p>Zone C</p><meter min="0" max="100" value="70">70%</meter><p>Available: 24 units</p><button data-target="${i === 9}">${i === 9 ? 'Reserve stock' : 'View stock'}</button></fieldset>`).join('')}</div></div>`;
    case 'booking-timetable':
      return `<h1>Rail departures</h1><p>Central station / weekday timetable</p><div id="target"><table style="width:3060px;table-layout:fixed"><thead><tr>${Array.from({ length: 9 }, (_, i) => `<th>${i === 0 ? 'Early departure' : `Departure ${i + 1}`}</th>`).join('')}</tr></thead><tbody><tr>${Array.from({ length: 9 }, (_, i) => `<td><time>${String(6 + i).padStart(2, '0')}:30</time><p>Platform ${i + 1}</p><p>Seats available</p><button data-target="${i === 0}">${i === 0 ? 'Book departure' : 'View service'}</button></td>`).join('')}</tr></tbody></table></div>`;
    case 'code-comparison':
      return `<h1>Configuration comparison</h1><p>Environment review / read only</p><div id="target"><div style="display:flex;width:3200px">${Array.from({ length: 8 }, (_, i) => `<section style="width:400px;flex-shrink:0;padding:24px;border-right:2px solid #aaa"><h2>${i === 7 ? 'Production configuration' : `Sandbox ${i + 1}`}</h2><pre style="background:#263442;color:#d9e4ec;padding:18px">service: atlas<br/>replicas: ${i + 1}<br/>logging: enabled<br/>region: west</pre><button data-target="${i === 7}">${i === 7 ? 'Inspect configuration' : 'Inspect sandbox'}</button></section>`).join('')}</div></div>`;
    case 'customer-cohorts':
      return `<h1>Customer analysis</h1><p>Quarterly cohort comparison</p><div id="target"><div style="display:flex;gap:20px;width:3300px;padding:20px">${Array.from({ length: 10 }, (_, i) => `<article style="width:306px;flex-shrink:0"><h2>${i === 0 ? 'Renewal cohort' : `Acquisition cohort ${i}`}</h2><div aria-label="Revenue chart" style="display:flex;align-items:end;height:100px;gap:10px"><div style="width:45px;height:45px;background:#8ba4b5"></div><div style="width:45px;height:75px;background:#5b809b"></div><div style="width:45px;height:95px;background:#315b8b"></div></div><p>Accounts: 120</p><button data-target="${i === 0}">${i === 0 ? 'Export cohort' : 'Open analysis'}</button></article>`).join('')}</div></div>`;
    default:
      throw new Error(`Unknown boundary fixture ${id}`);
  }
}
export function fixture(c) {
  return `<!doctype html><meta charset="utf-8"><title>${c.id}</title><style>
  *{box-sizing:border-box}body{margin:0;font:18px Arial;background:#eceff2;color:#253442}header{height:70px;padding:22px 38px;background:#263e4f;color:white}main{margin:26px 60px}h1{font-size:27px}h2{font-size:22px}#target{height:410px;width:880px;overflow:auto;background:white;border:2px solid #8996a2}td,th{padding:24px;border:1px solid #c2cbd3;text-align:left}th{background:#e6ebf1}button{font:inherit;padding:12px 20px;color:white;background:#315b8b;border:0;border-radius:4px}output{position:fixed;right:30px;top:24px;color:white}::-webkit-scrollbar{height:16px;width:16px}::-webkit-scrollbar-thumb{background:#627685}::-webkit-scrollbar-track{background:#d0d9df}
  </style><header>Operations workspace</header><main>${body(c.id)}</main><output id="result"></output><script>
  const t=document.querySelector('#target');window.oracle={ready:false,clicks:[]};
  if(${JSON.stringify(c.family)}==='left')t.scrollLeft=t.scrollWidth;
  document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{const ok=b.dataset.target==='true';window.oracle.clicks.push(ok?'target':'wrong');document.querySelector('#result').textContent=ok?'Completed':'Wrong selection';});
  window.snapshot=()=>{const r=t.getBoundingClientRect();return{x:t.scrollLeft,y:t.scrollTop,maxX:t.scrollWidth-t.clientWidth,maxY:t.scrollHeight-t.clientHeight,outerY:0,neighborY:0,rect:{left:r.left,top:r.top,width:r.width,height:r.height},rendered:true,clicks:[...window.oracle.clicks],result:document.querySelector('#result').textContent};};window.oracle.ready=true;
  </script>`;
}
