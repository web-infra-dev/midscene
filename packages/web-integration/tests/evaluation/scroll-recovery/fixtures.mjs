export const families = [
  'right',
  'left',
  'down',
  'up',
  'outer-motion',
  'nested-moving',
  'neighbors',
  'jitter',
  'layout-shift',
  'delayed',
  'animation',
  'boundary',
  'explicit',
  'reading',
  'virtual',
  'loadmore',
  'container-swap',
];
export const cases = families.flatMap((family) =>
  ['workspace', 'catalog'].map((layout) => ({
    id: `${family}-${layout}`,
    family,
    layout,
    split: layout === 'workspace' ? 'development' : 'held-out',
    controlled: [
      'right',
      'left',
      'outer-motion',
      'animation',
      'jitter',
      'layout-shift',
      'neighbors',
      'container-swap',
    ].includes(family),
    prompt:
      family === 'explicit'
        ? 'Scroll down exactly four times by 100 pixels each in the Records panel, then stop. Do not click anything.'
        : family === 'boundary'
          ? 'Scroll the Records panel down once. If there is no further content, stop. Do not click anything.'
          : ['reading', 'loadmore'].includes(family)
            ? 'Find the verification code at the end of Records, enter that code in the Verification field, and click Submit.'
            : 'Find the Archive item in the Records panel and click its Open button. Do not open another item.',
  })),
);

export function fixture(c) {
  const horizontal = [
    'right',
    'left',
    'outer-motion',
    'animation',
    'jitter',
    'layout-shift',
    'container-swap',
  ].includes(c.family);
  const reverse = ['left', 'up'].includes(c.family);
  const bounded = c.family === 'boundary';
  const nested = c.family === 'nested-moving' || c.family === 'outer-motion';
  const cards = Array.from({ length: bounded ? 1 : 9 }, (_, i) => {
    const target = i === (reverse ? 0 : 8);
    return `<section class="card"><h2>${target ? 'Archive' : `Record ${i + 1}`}</h2><p>Reference documents and review notes.</p>${['reading', 'loadmore'].includes(c.family) && target ? '<p>Verification code: RIVER-729</p>' : `<button data-target="${target}">Open</button>`}</section>`;
  }).join('');
  const panel = `<div id="target" class="panel" aria-label="Records"><div id="cards" class="cards">${cards}</div></div>`;
  const content =
    c.layout === 'workspace'
      ? `<header>Document workspace</header><aside>Projects<br/>Reviews<br/>Records</aside><main><h1>Records</h1>${panel}</main>`
      : `<header>Reference catalog</header><nav>Home / Collections / Records</nav><main class="catalog"><h1>Records</h1>${panel}<aside class="help">Collection details<br/>Last updated today</aside></main>`;
  return `<!doctype html><html><meta charset="utf-8"><title>Records</title><style>
  *{box-sizing:border-box}body{margin:0;font:18px Arial;background:#edf1f6;color:#192334}header{height:64px;padding:20px;background:#203958;color:white}aside{position:absolute;left:18px;top:110px;line-height:3}main{margin:20px 30px 20px 190px}h1{font-size:25px;margin:12px 0}.panel{height:430px;overflow:auto;border:2px solid #7c8da1;background:white}.cards{display:${horizontal ? 'flex' : 'block'};width:${horizontal ? 'max-content' : '100%'}}.card{padding:24px;border:1px solid #cad3df;${horizontal ? 'width:340px;height:390px;flex-shrink:0' : 'height:250px'}}button{font:inherit;padding:10px 26px;background:#1766c2;color:white;border:0}nav{padding:16px}main.catalog{margin:5px 220px 10px 40px}.catalog .panel{height:410px}.help{left:auto;right:20px;top:155px;font-size:16px}#result{position:fixed;right:20px;top:18px;color:white;z-index:10}#verification{position:fixed;bottom:8px;left:220px;background:white;padding:8px}input{font:inherit;width:180px}::-webkit-scrollbar{width:14px;height:14px}::-webkit-scrollbar-thumb{background:#708299}::-webkit-scrollbar-track{background:#dbe2eb}#outer{height:490px;overflow:auto}#outer>div{padding-bottom:550px}#neighbor{position:fixed;right:0;top:180px;width:140px;height:320px;overflow:auto;background:#f9eacb;z-index:2}#ticker{position:fixed;bottom:12px;right:12px}
  </style><body>${content}<output id="result"></output>${['reading', 'loadmore'].includes(c.family) ? '<form id="verification"><label>Verification <input id="answer"/></label><button>Submit</button></form>' : ''}<script>
  const family=${JSON.stringify(c.family)};const target=document.querySelector('#target');
  window.oracle={clicks:[],events:[],ready:false};
  ${nested ? "const wrapper=document.createElement('div');wrapper.id='outer';target.replaceWith(wrapper);const inner=document.createElement('div');wrapper.append(inner);inner.append(target);" : ''}
  ${c.family === 'neighbors' ? "const n=document.createElement('div');n.id='neighbor';n.innerHTML='<h3>Notes</h3>'+Array.from({length:30},(_,i)=>'<p>Note '+i+'</p>').join('');document.body.append(n);" : ''}
  ${c.family === 'animation' ? "const t=document.createElement('div');t.id='ticker';document.body.append(t);let tick=0;setInterval(()=>{t.textContent='Sync '+(++tick)},100);" : ''}
  if(${reverse}){target.scrollLeft=target.scrollWidth;target.scrollTop=target.scrollHeight;}
  if(family==='layout-shift')target.addEventListener('wheel',()=>{if(!window.oracle.shifted){window.oracle.shifted=true;target.style.transform='translateX(-120px)';}},{once:true});
  target.addEventListener('scroll',()=>{
    window.oracle.events.push({time:performance.now(),x:target.scrollLeft,y:target.scrollTop});
    if(family==='layout-shift'&&!window.oracle.shifted){window.oracle.shifted=true;target.style.transform='translateX(-120px)';}
    if(family==='delayed'){const cards=document.querySelector('#cards');cards.style.visibility='hidden';clearTimeout(window.restoreTimer);window.restoreTimer=setTimeout(()=>cards.style.visibility='visible',700);}
  });
  document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{const correct=b.dataset.target==='true';window.oracle.clicks.push(correct?'target':'wrong');document.querySelector('#result').textContent=correct?'Archive opened':'Wrong record';});
  document.querySelector('form')?.addEventListener('submit',e=>{e.preventDefault();const correct=document.querySelector('#answer').value==='RIVER-729';window.oracle.clicks.push(correct?'target':'wrong');document.querySelector('#result').textContent=correct?'Verified':'Invalid';});
  if(family==='loadmore'){
    const cards=[...document.querySelectorAll('.card')];let shown=3;
    const more=document.createElement('button');more.textContent='Load more';more.id='load-more';target.append(more);
    const render=()=>{cards.forEach((card,i)=>card.style.display=i<shown?'':'none');more.hidden=shown>=cards.length;};
    more.onclick=()=>{shown+=3;render();};render();
  }
  if(family==='virtual'){
    const cards=document.querySelector('#cards');cards.innerHTML='';cards.style.cssText='height:3150px;position:relative';
    const render=()=>{const first=Math.max(0,Math.floor(target.scrollTop/150));cards.innerHTML=Array.from({length:5},(_,j)=>{const i=first+j;if(i>20)return '';return '<section class="card" style="position:absolute;top:'+i*150+'px;height:150px;width:100%;padding:8px"><h2>'+(i===20?'Archive':'Record '+(i+1))+'</h2><button data-virtual="'+(i===20)+'">Open</button></section>';}).join('');cards.querySelectorAll('button').forEach(b=>b.onclick=()=>{const correct=b.dataset.virtual==='true';window.oracle.clicks.push(correct?'target':'wrong');document.querySelector('#result').textContent=correct?'Archive opened':'Wrong record';});};
    target.addEventListener('scroll',()=>{clearTimeout(window.virtualTimer);window.virtualTimer=setTimeout(render,350);});render();
  }
  if(family==='container-swap')target.addEventListener('wheel',()=>{
    const r=target.getBoundingClientRect();const notices=document.createElement('div');notices.id='neighbor';
    notices.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;overflow:auto;background:#fff3d6;z-index:20;padding:20px';
    notices.innerHTML='<button id="close-notices">Close notices</button><h2>Notifications</h2>'+Array.from({length:20},(_,i)=>'<p>Notice '+(i+1)+'</p>').join('');
    document.body.append(notices);document.querySelector('#close-notices').onclick=()=>notices.remove();
  },{once:true});
  window.snapshot=()=>{const r=target.getBoundingClientRect();const outer=document.querySelector('#outer');const neighbor=document.querySelector('#neighbor');return {x:target.scrollLeft,y:target.scrollTop,maxX:target.scrollWidth-target.clientWidth,maxY:target.scrollHeight-target.clientHeight,outerY:outer?.scrollTop||0,neighborY:neighbor?.scrollTop||0,rect:{left:r.left,top:r.top,width:r.width,height:r.height},rendered:document.querySelector('#cards').style.visibility!=='hidden',clicks:[...window.oracle.clicks],result:document.querySelector('#result').textContent};};
  window.oracle.ready=true;
  </script></body></html>`;
}
