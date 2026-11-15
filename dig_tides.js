import { publicTide, TIDE_NAMES } from "./public-tide.js?v=20261115-forcing-copy2";
import { drawSeries, mountHeader } from "./dig_common.js?v=20261115-forcing-copy2";
mountHeader(document.getElementById("dig-header"), {
    prov: "public", title: "Tides", source: "NOAA CO-OPS · 9414290",
    sentence: "Harmonic example from NOAA’s San Francisco station.",
});
document.getElementById("decomp-point").innerHTML =
    '<a href="'+publicTide.station_url+'" target="_blank" rel="noopener">NOAA San Francisco · station 9414290 ↗</a>';
const NT = 300, HOURS = 72;
const constituents = {}, sum = new Array(NT).fill(0);
publicTide.constituents.forEach(c => {
    const ys = Array.from({length:NT}, (_,k) => c.amplitude * Math.cos(2*Math.PI*(k/(NT-1))*HOURS/c.period-c.phase*Math.PI/180));
    ys.forEach((v,k) => sum[k] += v);
    constituents[c.name] = {...c,ys};
});
let selected = null;
function redraw() {
    const series = TIDE_NAMES.map(name => ({ys:constituents[name].ys,color:name===selected?"#f2a63c":"rgba(255,255,255,0.18)",width:name===selected?2.5:1}));
    series.push({ys:sum,color:"#5cb3ff",width:2.5});
    drawSeries(document.getElementById("decomp-canvas"),series,{zeroLine:true});
}
const picker=document.getElementById("constituent-picker");
[...TIDE_NAMES].sort((a,b)=>constituents[b].amplitude-constituents[a].amplitude).forEach(name=>{
    const button=document.createElement("button");button.className="tide-chip";button.textContent=name;
    button.addEventListener("click",()=>{
        selected=selected===name?null:name;
        [...picker.children].forEach(b=>b.classList.toggle("active",b.textContent===selected));
        document.getElementById("constituent-info").textContent=selected?`${selected} · ${constituents[selected].period.toFixed(2)} h · ${constituents[selected].amplitude.toFixed(3)} m at San Francisco`:"";
        redraw();
    });picker.append(button);
});
redraw();window.addEventListener("resize",redraw);
