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
