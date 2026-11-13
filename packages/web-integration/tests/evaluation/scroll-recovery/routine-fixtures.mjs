const clickGoal = ({ final }) => final?.clicks?.includes('target');
export const cases = [
  {
    id: 'routine-signin',
    prompt:
      'Enter demo@example.test as Email and sample-pass as Password, then click Sign in.',
  },
  {
    id: 'routine-preferences',
    prompt: 'Enable email notifications, then click Save preferences.',
  },
  {
    id: 'routine-dialog',
    prompt:
      'Open Notification settings, then cancel the dialog. Do not save changes.',
  },
  {
    id: 'routine-search',
    prompt:
      'Search for Cedar, then click Open Cedar. Do not open another result.',
  },
  {
    id: 'routine-receipts',
    prompt:
      'Find Receipt 8 in the receipts list and click Download receipt 8. Do not click another receipt.',
  },
  {
    id: 'routine-loadmore',
    prompt:
      'Use Load more to find the Complete archive button, then click it. Do not click another entry.',
  },
  {
    id: 'routine-exact-moving',
    prompt:
      'Scroll the Activity panel down exactly four times by 100 pixels each, then stop. Do not click anything.',
    exact: true,
    bounded: false,
  },
  {
    id: 'routine-exact-boundary',
    prompt:
      'Scroll the Activity panel down exactly four times by 100 pixels each even if the content does not move, then stop. Do not click anything.',
    exact: true,
    bounded: true,
  },
].map((c) => ({
  ...c,
  family: 'routine',
  split: 'development',
  controlled: false,
  evaluate: ({ actions, initial, final }) => {
    const compliant = c.exact
      ? actions.length === 4 &&
        actions.every(
          (a) =>
            a.name === 'Scroll' &&
            a.param.direction === 'down' &&
            a.param.distance === 100,
        )
      : !final?.clicks?.includes('wrong');
    const goalReached = c.exact
      ? compliant &&
        Math.abs(
          (final?.y ?? Number.NaN) -
            (initial?.y ?? Number.NaN) -
            (c.bounded ? 0 : 400),
        ) <= 2
      : clickGoal({ final });
    return { compliant, goalReached };
  },
}));
export function fixture(c) {
  let body;
  let script;
  switch (c.id) {
    case 'routine-signin':
      body =
        '<h1>Team portal</h1><form><label>Email <input id="email" type="email"/></label><label>Password <input id="password" type="password"/></label><button>Sign in</button></form>';
      script =
        "document.querySelector('form').onsubmit=e=>{e.preventDefault();done(document.querySelector('#email').value==='demo@example.test'&&document.querySelector('#password').value==='sample-pass')};";
      break;
    case 'routine-preferences':
      body =
        '<h1>Notification preferences</h1><label><input type="checkbox" id="email"/> Email notifications</label><p>Choose how we contact you.</p><button id="save">Save preferences</button>';
      script =
        "document.querySelector('#save').onclick=()=>done(document.querySelector('#email').checked);";
      break;
    case 'routine-dialog':
      body =
        '<h1>Account settings</h1><button id="open">Notification settings</button><dialog><h2>Notification settings</h2><p>Change delivery options</p><button id="cancel">Cancel</button><button id="save">Save changes</button></dialog>';
      script =
        "document.querySelector('#open').onclick=()=>document.querySelector('dialog').showModal();document.querySelector('#cancel').onclick=()=>{document.querySelector('dialog').close();done(true)};document.querySelector('#save').onclick=()=>done(false);";
      break;
    case 'routine-search':
      body =
        '<h1>Document directory</h1><label>Search <input id="query"/></label><button id="search">Search</button><div id="results"></div>';
      script =
        "document.querySelector('#search').onclick=()=>{document.querySelector('#results').innerHTML=document.querySelector('#query').value.toLowerCase().includes('cedar')?'<h2>Cedar</h2><button id=\"cedar\">Open Cedar</button>':'No matching documents';document.querySelector('#cedar')?.addEventListener('click',()=>done(true));};";
      break;
    case 'routine-receipts':
      body = `<h1>Receipts</h1><div id="target" class="scroll">${Array.from(
        { length: 8 },
        (_, i) =>
          `<section><h2>Receipt ${i + 1}</h2><button data-receipt="${i + 1}">Download receipt ${i + 1}</button></section>`,
      ).join('')}</div>`;
      script =
        "document.querySelectorAll('[data-receipt]').forEach(b=>b.onclick=()=>done(b.dataset.receipt==='8'));";
      break;
    case 'routine-loadmore':
      body =
        '<h1>Archive browser</h1><div id="entries"><p>Entries 1–3 are loaded.</p></div><button id="more">Load more</button>';
      script =
        "let page=0;document.querySelector('#more').onclick=()=>{page++;document.querySelector('#entries').innerHTML=page===1?'<p>Entries 4–6 are loaded. More entries are available.</p>':'<p>Archive complete</p><button id=\"finish\">Complete archive</button>';if(page===2){document.querySelector('#more').hidden=true;document.querySelector('#finish').onclick=()=>done(true);}};";
      break;
    case 'routine-exact-moving':
    case 'routine-exact-boundary':
      body = `<h1>Activity</h1><div id="target" class="scroll"><div style="height:${c.bounded ? '100' : '1300'}px;padding:20px">Activity panel<br/>Recent activity</div></div>`;
      script = '';
      break;
    default:
      throw new Error(`Unknown routine fixture ${c.id}`);
  }
  return `<!doctype html><meta charset="utf-8"><title>${c.id}</title><style>*{box-sizing:border-box}body{margin:0;font:20px Arial;background:#eef2f5;color:#25364b}header{padding:20px 60px;background:#29465b;color:white}main{margin:28px 150px;width:700px;background:white;padding:28px}h1{font-size:27px}label{display:block;margin:18px 0}input{font:inherit;padding:8px}button{font:inherit;background:#285f91;color:white;border:0;padding:10px 20px;margin:8px}dialog{border:2px solid #62768a;padding:30px}output{position:fixed;right:20px;top:20px;color:white}.scroll{width:600px;height:300px;overflow:auto;border:2px solid #66788b}section{height:150px;padding:12px 20px;border-bottom:1px solid #ccc}h2{font-size:21px;margin:10px}::-webkit-scrollbar{width:16px}::-webkit-scrollbar-thumb{background:#687f91}</style><header>Workspace</header><main>${body}</main><output id="result"></output><script>
 window.oracle={ready:false,clicks:[]};const done=ok=>{window.oracle.clicks.push(ok?'target':'wrong');document.querySelector('#result').textContent=ok?'Completed':'Wrong input'};${script}
 window.snapshot=()=>{const t=document.querySelector('#target')||document.scrollingElement;const r=t.getBoundingClientRect();return{x:t.scrollLeft,y:t.scrollTop,maxX:t.scrollWidth-t.clientWidth,maxY:t.scrollHeight-t.clientHeight,outerY:0,neighborY:0,rect:{left:r.left,top:r.top,width:r.width,height:r.height},rendered:true,clicks:[...window.oracle.clicks],result:document.querySelector('#result').textContent};};window.oracle.ready=true;
 </script>`;
}
