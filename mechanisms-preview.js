import { potentialDensityAnomaly } from './budget-physics.js?v=20261112-density';

const $ = selector => document.querySelector(selector);
const SVG_NS = 'http://www.w3.org/2000/svg';
const processes = [
  { id:'heat', name:'Surface heat', keys:['heat'], colour:'#bc714e' },
  { id:'fw', name:'Freshwater', keys:['fw'], colour:'#438f87' },
  { id:'mix', name:'Vertical mixing', keys:['mix'], colour:'#827198' },
  { id:'adv', name:'Advection', keys:['hadv','vadv'], colour:'#497c9a' },
  { id:'dif', name:'Horizontal diffusion', keys:['hdif'], colour:'#869454' },
  { id:'nudg', name:'Relaxation', keys:['nudg'], colour:'#a47c8c' },
  { id:'cor', name:'Corrections', keys:['dilut','geom','tlres','slres','eos'], colour:'#8a877e' }
];
let data, day = 60, playing = false, previousTime = 0;
let highlighted = null;
const profiles = [
  { key:'temp', title:'Temperature', unit:'°C', colour:'#bc714e' },
  { key:'salt', title:'Salinity', unit:'PSU', colour:'#497c9a' },
  { key:'density', title:'Density (σθ)', unit:'kg m⁻³', colour:'#376a70' }
];
const format = (value, decimals=1) => Number(value).toLocaleString('en-NZ', {
  minimumFractionDigits:decimals, maximumFractionDigits:decimals
});
const formatDate = date => new Date(date+'T12:00:00Z').toLocaleDateString('en-NZ', {
  day:'numeric', month:'short', year:'numeric', timeZone:'UTC'
});
const rate = (record, process) => process.keys.reduce((sum,key) => sum+record.rates[key], 0);

function element(tag, attributes, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
  parent.append(node);
  return node;
}
function label(svg, x, y, value, attributes={}) {
  const node = element('text', { x,y,...attributes },svg);
  node.textContent = value;
  return node;
}
function line(svg, x1, y1, x2, y2, attributes={}) {
  return element('line', { x1,y1,x2,y2,stroke:'#cbd0c4',...attributes }, svg);
}
function figure(target, height, description) {
  const container = $(target);
  container.replaceChildren();
  const width = Math.max(320,container.clientWidth);
  return { width, svg:element('svg', {
    viewBox:`0 0 ${width} ${height}`, role:'img', 'aria-label':description
  },container) };
}
function path(x, y) {
  return x.map((value,index) => `${index?'L':'M'}${value.toFixed(2)},${y[index].toFixed(2)}`).join(' ');
}

function drawProfiles() {
  const {svg,width} = figure('#profiles',255,'Temperature, salinity and surface-referenced potential density profiles');
  const panelWidth = width/3;
  profiles.forEach((profile,index) => {
    const left = index*panelWidth + (index===0?31:18);
    const right = (index+1)*panelWidth-14;
    const x = value => left+(value-profile.min)/(profile.max-profile.min)*(right-left);
    const y = depth => 49+depth/250*170;
    label(svg,left,13,profile.title,{class:'title'});
    label(svg,left,30,profile.unit);
    line(svg,left,49,left,219);
    line(svg,left,219,right,219);
    for (const depth of [0,100,200,250]) {
      if (index===0) label(svg,left-8,y(depth)+4,depth,{'text-anchor':'end'});
    }
    line(svg,left,y(200),right,y(200),{'stroke-dasharray':'2 4'});
    const ticks = width<500?2:3;
    for (let i=0;i<ticks;i++) {
      const value = profile.min+(profile.max-profile.min)*i/(ticks-1);
      label(svg,x(value),239,format(value),{'text-anchor':'middle'});
    }
    for (const [record,opacity,strokeWidth] of [[data.days[0],.25,1],[data.days[day],1,2]]) {
      element('path', {
        d:path(record[profile.key].map(x),record.depth.map(y)), fill:'none',
        stroke:profile.colour, 'stroke-width':strokeWidth, opacity
      },svg);
    }
  });
  label(svg,5,145,'m');
}

function createProcesses() {
  const container = $('#processes');
  container.setAttribute('role','list');
  processes.forEach(process => {
    const row = document.createElement('div');
    row.className='process';
    row.tabIndex=0;
    row.setAttribute('role','listitem');
    row.style.setProperty('--colour',process.colour);
    const name=document.createElement('span');
    name.className='process-label';
    name.textContent=process.name;
    const bar=document.createElement('span');
    bar.className='process-bar';
    bar.setAttribute('aria-hidden','true');
    bar.append(document.createElement('i'));
    const value=document.createElement('span');
    value.className='process-value';
    row.append(name,bar,value);
    row.addEventListener('mouseenter',()=>highlight(process.id));
    row.addEventListener('mouseleave',()=>highlight(null));
    row.addEventListener('focus',()=>highlight(process.id));
    row.addEventListener('blur',()=>highlight(null));
    process.row=row;
    container.append(row);
  });
}
function updateProcesses() {
  processes.forEach(process => {
    const value=rate(data.days[day],process)*86400;
    const extent=Math.abs(value)/data.maxRate*50;
    const bar=process.row.querySelector('i');
    bar.style.left=(value<0?50-extent:50)+'%';
    bar.style.width=extent+'%';
    process.row.querySelector('.process-value').textContent=(value>0?'+':'')+format(value,2);
    process.row.setAttribute('aria-label',`${process.name}: ${format(value,3)} joules per cubic metre per day. Follow contribution in the seasonal plot.`);
  });
}
function highlight(id) {
  highlighted=id;
  document.querySelectorAll('[data-process]').forEach(node => {
    node.setAttribute('opacity',!id||node.dataset.process===id?1:.14);
    node.setAttribute('stroke-width',id===node.dataset.process?2.7:1.6);
  });
}

function drawSeason() {
  const {svg,width} = figure('#season',240,'Model potential energy anomaly and accumulated process contributions since 1 September');
  const left=40, right=width-15, top=14, bottom=202;
  const x=index=>left+index/data.days.length*(right-left);
  const y=value=>bottom-(value-data.seasonMin)/(data.seasonMax-data.seasonMin)*(bottom-top);
  line(svg,left,top,left,bottom);
  line(svg,left,bottom,right,bottom);
  line(svg,left,y(0),right,y(0),{'stroke-dasharray':'2 4'});
  for (let i=0;i<5;i++) {
    const value=data.seasonMin+(data.seasonMax-data.seasonMin)*i/4;
    label(svg,left-8,y(value)+4,format(value,0),{'text-anchor':'end'});
  }
  processes.forEach(process => element('path', {
    d:path(process.accumulated.slice(0,day+2).map((_,i)=>x(i)),process.accumulated.slice(0,day+2).map(y)),
    fill:'none',stroke:process.colour,'stroke-width':1.6,'data-process':process.id
  },svg));
  const state=data.pea.slice(0,day+2);
  element('path',{d:path(state.map((_,i)=>x(i)),state.map(y)),fill:'none',stroke:'#293b3a','stroke-width':2.3},svg);
  line(svg,x(day+1),top,x(day+1),bottom,{stroke:'#69736c',opacity:.45});
  element('circle',{cx:x(day+1),cy:y(data.pea[day+1]),r:3,fill:'#293b3a'},svg);
  data.days.forEach((record,index) => {
    if (record.date.endsWith('-01')) label(svg,x(index),225,
      new Date(record.date+'T12:00:00Z').toLocaleDateString('en-NZ',{month:'short',timeZone:'UTC'}),
      {'text-anchor':'middle'});
  });
  highlight(highlighted);
}

function render() {
  if (!data) return;
  const record=data.days[day];
  $('#date').textContent=formatDate(record.date);
  $('#pea').textContent=format(record.pea_end);
  $('#day').value=day;
  $('#day').style.setProperty('--progress',100*day/(data.days.length-1)+'%');
  $('#day').setAttribute('aria-valuetext',formatDate(record.date));
  drawProfiles();
  updateProcesses();
  drawSeason();
}
function play(enabled) {
  playing=enabled;
  previousTime=0;
  $('#play span').textContent=enabled?'Pause':'Play';
  $('#play').setAttribute('aria-label',enabled?'Pause seasonal development':'Play seasonal development');
  $('#play path').setAttribute('d',enabled?'M4 3h3v10H4ZM9 3h3v10H9Z':'m5 3 7 5-7 5Z');
}
$('#play').addEventListener('click',()=>{
  if (!data) return;
  if (day===data.days.length-1) day=0;
  play(!playing);
});
$('#day').addEventListener('input',event=>{
  play(false);
  day=Number(event.target.value);
  render();
});
window.addEventListener('resize',render);
document.addEventListener('visibilitychange',()=>{if(document.hidden)play(false)});
function tick(time) {
  if (playing) {
    if (!previousTime) previousTime=time;
    if (time-previousTime>140) {
      day=Math.min(day+1,data.days.length-1);
      previousTime=time;
      render();
      if (day===data.days.length-1) play(false);
    }
  }
  requestAnimationFrame(tick);
}
try {
  const response=await fetch('./data/methods-demo/season.json?v=20261112');
  if (!response.ok) throw Error('The seasonal data could not be loaded.');
  data=await response.json();
  for (const record of data.days) record.density=record.temp.map((t,i)=>potentialDensityAnomaly(t,record.salt[i]));
  for (const profile of profiles) {
    const values=data.days.flatMap(record=>record[profile.key]);
    profile.min=Math.floor(Math.min(...values)*2)/2;
    profile.max=Math.ceil(Math.max(...values)*2)/2;
    if (profile.max===profile.min) profile.max++;
  }
  data.maxRate=Math.max(...data.days.flatMap(record=>processes.map(process=>Math.abs(rate(record,process)*86400))))*1.05;
  processes.forEach(process=>{
    let sum=0;
    process.accumulated=[0,...data.days.map(record=>sum+=rate(record,process)*record.seconds)];
  });
  data.pea=[data.days[0].pea_start,...data.days.map(record=>record.pea_end)];
  const values=[...data.pea,...processes.flatMap(process=>process.accumulated)];
  const min=Math.min(...values),max=Math.max(...values),pad=(max-min)*.08||1;
  data.seasonMin=min-pad;
  data.seasonMax=max+pad;
  $('#day').max=data.days.length-1;
  $('#validation').textContent='The accumulated contributions reconstruct the final PEA to within '+format(Math.abs(data.validation.final_accumulated_reconstruction_error),4)+' J m⁻³, consistent with archived field precision.';
  $('#status').hidden=true;
  $('#demo').hidden=false;
  createProcesses();
  render();
  requestAnimationFrame(tick);
  window.__budgetDemo={data,get day(){return day},setDay(index){play(false);day=index;render()}};
} catch(error) {
  $('#status').textContent=error.message;
}
