/* Shared language preference, including dynamically rendered model controls. */
(()=>{
 let language=new URLSearchParams(location.search).get('lang');if(!['en','mi'].includes(language)){try{language=localStorage.getItem('site-language')||'en'}catch(_){language='en'}}
 const originalTitle=document.title;let dictionary={},ordered=[];const records=new WeakMap();let observer;
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 function translate(s){
  if(language!=='mi'||!/[A-Za-z]/.test(s))return s;const trimmed=s.trim(),key=trimmed.replace(/\s+/g,' ');if(dictionary[key])return s.replace(trimmed,dictionary[key]);
  let result=s;for(const [pattern,mi] of ordered){result=result.replace(pattern,mi)}return result;
 }
 function visit(root){
  if(root.nodeType===3){const parent=root.parentElement;if(!parent||parent.closest('script,style,code,pre,.language-switch'))return;let r=records.get(root);if(!r||root.nodeValue!==r.rendered)r={original:root.nodeValue};const next=translate(r.original);if(root.nodeValue!==next)root.nodeValue=next;r.rendered=next;records.set(root,r);return}
  if(root.nodeType!==1&&root.nodeType!==9)return;if(root.matches?.('script,style,code,pre,.language-switch'))return;[...root.childNodes].forEach(visit);
 }
 function refresh(){observer?.disconnect();visit(document.body);document.documentElement.lang=language;document.title=language==='mi'?'Kaitūhura tauira ROMS · '+(dictionary[document.body.querySelector('h1')?.textContent]||'Mātai aumoana'):originalTitle;document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));observer?.observe(document.body,{childList:true,subtree:true,characterData:true})}
 function choose(next){language=next;try{localStorage.setItem('site-language',language)}catch(_){}refresh();document.dispatchEvent(new CustomEvent('site-language-change',{detail:{language}}));window.dispatchEvent(new Event('resize'))}
 const group=document.createElement('div');group.className='language-switch';group.setAttribute('role','group');group.setAttribute('aria-label','Language / Reo');for(const [code,label] of [['en','EN'],['mi','Te Reo Māori']]){const b=document.createElement('button');b.type='button';b.dataset.language=code;b.lang=code;b.textContent=label;b.onclick=()=>choose(code);group.append(b)}document.body.append(group);
 const originalFill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){return originalFill.call(this,translate(String(text)),...args)};
 fetch('language-mi.json?v=20261112-control-qc').then(r=>r.json()).then(d=>{dictionary=d;ordered=Object.entries(d).filter(([k])=>k.length>=3).sort((a,b)=>b[0].length-a[0].length).map(([en,mi])=>[new RegExp('(?<![A-Za-z])'+escape(en)+'(?![A-Za-z])','g'),mi]);observer=new MutationObserver(()=>refresh());refresh()});
})();
