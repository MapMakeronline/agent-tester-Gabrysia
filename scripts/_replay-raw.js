const fs = require('fs');
const testId = process.argv[2] || 'TC-TABLE-006';
const raw = JSON.parse(fs.readFileSync(`C:/Users/Dom/.claude/agents/tester/data/learned-procedures/${testId}-raw.json`,'utf8'));

function sameEl(a,b) { if(!a||!b) return false; return a.tag===b.tag&&a.id===b.id&&a.name===b.name&&a.ariaLabel===b.ariaLabel; }
function selectors(el) {
  const s=[];
  if(!el) return s;
  if(el.role&&(el.ariaLabel||el.text)){const n=el.ariaLabel||el.text;if(n.length<=60)s.push({strategy:'role',role:el.role,name:n});}
  if(el.ariaLabel)s.push({strategy:'aria-label',value:el.ariaLabel});
  if(el.name)s.push({strategy:'name',value:el.name});
  if(el.text&&el.text.length>0&&el.text.length<=60)s.push({strategy:'text',value:el.text});
  if(el.id)s.push({strategy:'css-id',value:'#'+el.id});
  if(s.length===0&&el.className&&typeof el.className==='string')s.push({strategy:'css-class',value:el.className.split(' ')[0],lowConfidence:true});
  return s;
}

const deduped=[];
for(const e of raw){const l=deduped[deduped.length-1];if(l&&l.type===e.type&&Math.abs(l.timestamp-e.timestamp)<50)continue;deduped.push(e);}

const steps=[];let i=0;
while(i<deduped.length){
  const e=deduped[i];
  if(e.type==='input'){
    let v=e.value,el=e.element,j=i+1;
    while(j<deduped.length){const n=deduped[j];if(n.type==='input'&&sameEl(n.element,e.element)){if(n.timestamp-deduped[j-1].timestamp>5000)break;v=n.value;el=n.element;j++;}else break;}
    steps.push({action:'type',value:v,element:el});i=j;continue;
  }
  if((e.type==='click'||e.type==='dblclick')&&e.element&&e.element.isCanvas){
    steps.push({action:'canvas_click',element:e.element,canvasPosition:e.canvasPosition});i++;continue;
  }
  if(e.type==='click'||e.type==='dblclick'){
    let skip=false;
    for(let k=i+1;k<Math.min(i+6,deduped.length);k++){const a=deduped[k];if(a.type==='input'&&sameEl(a.element,e.element)){skip=true;break;}if(!sameEl(a.element,e.element)&&a.type!=='click')break;}
    if(skip){i++;continue;}
    steps.push({action:e.type==='dblclick'?'dblclick':'click',element:e.element});i++;continue;
  }
  if(e.type==='keydown'){steps.push({action:'press_key',key:e.key,element:e.element});i++;continue;}
  if(e.type==='navigate'){steps.push({action:'navigate',url:e.url});i++;continue;}
  i++;
}

console.log('Przetworzone kroki ('+steps.length+'):\n');
steps.forEach((s,idx)=>{
  const el=s.element;
  const name=el?(el.ariaLabel||el.text||el.name||el.id||(typeof el.className==='string'?el.className.substring(0,30):'?')):'?';
  let desc='';
  if(s.action==='click')desc='Kliknij '+(el&&el.role==='button'?'przycisk':el&&el.role==='link'?'link':'element')+' "'+name+'"';
  else if(s.action==='dblclick')desc='Dwuklik "'+name+'"';
  else if(s.action==='type')desc='Wpisz "'+s.value+'" w pole';
  else if(s.action==='press_key')desc='Nacisnij '+s.key;
  else if(s.action==='navigate')desc='Nawiguj do '+s.url;
  else if(s.action==='canvas_click')desc='Klik mapa ~'+(s.canvasPosition?s.canvasPosition.relX:0)+'%,'+(s.canvasPosition?s.canvasPosition.relY:0)+'%';
  const sel=selectors(el);
  const selStr=sel.map(function(x){return x.strategy+'='+(x.name||x.value||'');}).join(', ');
  console.log('  '+(idx+1)+'. ['+s.action+'] '+desc);
  if(selStr) console.log('     sel: '+selStr);
});
