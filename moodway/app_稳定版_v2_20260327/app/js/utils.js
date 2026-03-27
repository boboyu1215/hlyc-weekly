// ════════════════════════════════════════════════════
// utils.js — 工具函数（日期、转义、格式化等）
// ════════════════════════════════════════════════════

function sc(s){ return s==='r'?'r':s==='y'?'y':'g'; }
function esc(s){ return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fieldVal(k,v){
  if(k==='status'||k==='defStatus') return STATUS_LABEL[v]||v||'—';
  if(k==='stage'||k==='defStage') return STAGES[v]||v||'—';
  if(k==='archived') return v?'已归档':'在建';
  // 列表格式字段：转为可读字符串（用于 Diff 展示）
  if(Array.isArray(v)){
    const items = v.filter(i=>i&&i.text&&i.text.trim());
    if(!items.length) return '（空）';
    return items.map((i,idx)=>{
      const date = i.dueDate ? ` [${i.dueDate.replace(/-/g,'/')}]` : '';
      return `${idx+1}. ${i.text}${date}`;
    }).join(' / ');
  }
  return (v===null||v===undefined||v==='') ? '（空）' : String(v);
}

function toDateTimeLocal(v){
  if(!v) return '';
  const match = v.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if(!match) return '';
  const [,y,mo,d,h,m] = match;
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${m}`;
}

function fromDateTimeLocal(v){
  if(!v) return '';
  const match = v.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(!match) return '';
  const [,y,mo,d,h,m] = match;
  return `${y}/${parseInt(mo)}/${parseInt(d)} ${h}:${m}`;
}

function isoWk(d){
  const t=new Date(d); t.setHours(0,0,0,0); t.setDate(t.getDate()+3-(t.getDay()+6)%7);
  const w=new Date(t.getFullYear(),0,4);
  return {yr:t.getFullYear(), wk:1+Math.round(((t-w)/864e5-(3-(w.getDay()+6)%7))/7)};
}

function wkKey(yr,wk){ return `${yr}-W${String(wk).padStart(2,'0')}`; }
function parseWkKey(k){ const m=k.match(/(\d{4})-W(\d+)/); return m?{yr:+m[1],wk:+m[2]}:null; }
function wkLabel(yr,wk){ return `${yr}年 第${wk}周`; }
function wkRange(yr,wk){
  const j4=new Date(yr,0,4);
  const mon=new Date(j4); mon.setDate(j4.getDate()-(j4.getDay()||7)+1+(wk-1)*7);
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  const f=d=>d.toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});
  return `${f(mon)} — ${f(sun)}`;
}

function todayStr(){ return new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}); }

function _relativeTime(ts){
  if(!ts) return '';
  const diff = Math.floor((Date.now()-ts)/1000);
  return diff<60?'刚刚':diff<3600?Math.floor(diff/60)+'分钟前':Math.floor(diff/3600)+'小时前';
}

window.autoH = function(el){
  el.style.height='0';
  const h = el.scrollHeight;
  // padding-top + 1行行高 + padding-bottom ≈ 34px 作为最小值
  el.style.height = Math.max(34, h) + 'px';
};
