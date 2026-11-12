/* Shared language preference for model pages and their embedded methods view. */
(() => {
 const valid=value=>['en','mi'].includes(value);
 let language=new URLSearchParams(location.search).get('lang');
 if(!valid(language)){try{language=localStorage.getItem('site-language')}catch(_){}}
 if(!valid(language))language='en';
 const originalTitle=document.title;
 const originalHeading=document.querySelector('h1')?.textContent;
 const records=new WeakMap(),attributeRecords=new WeakMap();
 let dictionary={},ordered=[],observer;
 const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const ignored='script,style,code,pre,.language-switch,[data-i18n-ignore]';
 function translate(text) {
  if(language!=='mi'||!/[A-Za-z]/.test(text))return text;
  const trimmed=text.trim(),key=trimmed.replace(/\s+/g,' ');
  if(dictionary[key])return text.replace(trimmed,dictionary[key]);
  let result=text;
  for(const [pattern,value] of ordered)result=result.replace(pattern,value);
  return result;
 }
 function visit(node) {
  if(node.nodeType===3){
   if(!node.parentElement||node.parentElement.closest(ignored))return;
   let record=records.get(node);
   if(!record||node.nodeValue!==record.rendered)record={original:node.nodeValue};
   const next=translate(record.original);
   if(node.nodeValue!==next)node.nodeValue=next;
   record.rendered=next;records.set(node,record);return;
  }
  if(node.nodeType!==1&&node.nodeType!==9)return;
  if(node.matches?.(ignored))return;
  if(node.nodeType===1){
   let saved=attributeRecords.get(node);if(!saved){saved={};attributeRecords.set(node,saved)}
   for(const name of ['aria-label','aria-valuetext','title','alt']){
    if(!node.hasAttribute(name))continue;
    const value=node.getAttribute(name);let record=saved[name];
    if(!record||value!==record.rendered)record={original:value};
    const next=translate(record.original);
    if(value!==next)node.setAttribute(name,next);
    record.rendered=next;saved[name]=record;
   }
  }
  [...node.childNodes].forEach(visit);
 }
 function broadcast(){
  document.querySelectorAll('iframe').forEach(frame=>{
   try{frame.contentWindow?.postMessage({type:'model-language',language},location.origin)}catch(_){}
  });
 }
 function refresh(){
  observer?.disconnect();
  document.documentElement.lang=language;
  visit(document.body);
  document.title=language==='mi'?(dictionary[originalTitle]||dictionary[originalHeading]||translate(originalTitle)):originalTitle;
  document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
  observer?.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','aria-valuetext','title','alt']});
 }
 function choose(next,persist=true){
  if(!valid(next))return;
  language=next;
  if(persist){try{localStorage.setItem('site-language',language)}catch(_){}}
  refresh();broadcast();
  document.dispatchEvent(new CustomEvent('site-language-change',{detail:{language}}));
  window.dispatchEvent(new Event('resize'));
 }
 window.modelLanguage={get language(){return language},translate,refresh};
 const group=document.createElement('div');group.className='language-switch';group.setAttribute('role','group');group.setAttribute('aria-label','Language / Reo');
 for(const [code,label] of [['en','EN'],['mi','Te Reo Māori']]){
  const button=document.createElement('button');button.type='button';button.dataset.language=code;button.lang=code;button.textContent=label;button.onclick=()=>choose(code);group.append(button);
 }
 (document.querySelector('[data-language-controls]')||document.body).append(group);
 window.addEventListener('storage',event=>{if(event.key==='site-language'&&valid(event.newValue)&&event.newValue!==language)choose(event.newValue,false)});
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='model-language'&&valid(event.data.language)&&event.data.language!==language)choose(event.data.language,false)});
 document.addEventListener('load',event=>{if(event.target.tagName==='IFRAME')broadcast()},true);
 const originalFill=CanvasRenderingContext2D.prototype.fillText;
 CanvasRenderingContext2D.prototype.fillText=function(text,...args){return originalFill.call(this,translate(String(text)),...args)};
 try{localStorage.setItem('site-language',language)}catch(_){}
 document.documentElement.lang=language;
 fetch('language-mi.json?v=20261113-budget-reo').then(response=>{if(!response.ok)throw Error(response.status);return response.json()}).then(data=>{
  dictionary=data;
  ordered=Object.entries(data).filter(([key])=>key.length>=3).sort((a,b)=>b[0].length-a[0].length).map(([en,mi])=>[new RegExp('(?<![A-Za-z])'+escape(en)+'(?![A-Za-z])','g'),mi]);
  observer=new MutationObserver(refresh);refresh();broadcast();
  document.dispatchEvent(new CustomEvent('site-language-change',{detail:{language}}));
 }).catch(()=>{document.querySelectorAll('[data-language]').forEach(button=>button.disabled=true)});
})();
