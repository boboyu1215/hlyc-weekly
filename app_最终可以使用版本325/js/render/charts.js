// ════════════════════════════════════════════════════
// render/charts.js — 可视化看板渲染
// ════════════════════════════════════════════════════

function renderCharts(){
  const projects=LP(); const active=projects.filter(p=>!p.archived);
  const snaps=active.map(p=>({...p,...getSnap(S.yr,S.wk,p.id,projects)}));
  const sc2={r:0,y:0,g:0}; snaps.forEach(p=>sc2[p.status]=(sc2[p.status]||0)+1);
  const sd=Array(STAGES.length).fill(0); snaps.forEach(p=>sd[Math.min(p.stage,STAGES.length-1)]++);
  const maxSD=Math.max(...sd,1);
  const sorted=[...snaps].sort((a,b)=>({'r':0,'y':1,'g':2}[a.status]||0)-({'r':0,'y':1,'g':2}[b.status]||0));
  const redProjects=snaps.filter(p=>{
    // getSnap 已经过 _resolveStatus，status='r' 时必然有 risk 或 decision 实质内容
    return p.status==='r';
  });
  const yelProjects=snaps.filter(p=>p.status==='y');
  const grnProjects=snaps.filter(p=>p.status==='g');

  // 时间轴数据
  const today=new Date(); today.setHours(0,0,0,0);
  const tlItems=active.map(p=>{
    const snap=snaps.find(s=>s.id===p.id)||{};
    const start=p.startDate?new Date(p.startDate.replace(/\//g,'-')):null;
    const end=p.completionDate?new Date(p.completionDate.replace(/\//g,'-')):null;
    const dFS=start?Math.round((today-start)/86400000):null;
    const dTE=end?Math.round((end-today)/86400000):null;
    return{...p,status:snap.status||'g',start,end,dFS,dTE};
  }).filter(p=>p.start||p.end);
  const allDates=[...tlItems.map(p=>p.start),today,...tlItems.map(p=>p.end)].filter(Boolean);
  const minD=allDates.reduce((a,b)=>a<b?a:b,today);
  const maxD=allDates.reduce((a,b)=>a>b?a:b,today);
  const span=Math.max((maxD-minD)/86400000,1);
  const minS=(minD-today)/86400000;

  return`
  <div class="print-hd" style="--print-title:'华力集团｜研策部可视化周报'"><h1>华力集团｜研策部可视化周报</h1><p>${wkLabel(S.yr,S.wk)}（${wkRange(S.yr,S.wk)}）</p></div>
  <div class="io-bar no-print">
    <span id="_sync_label_charts" class="io-btn" style="cursor:default">☁ 已同步</span>
    <button class="io-btn" onclick="window.print()">📄 导出 PDF</button>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="font-size:14px;font-weight:700">${wkLabel(S.yr,S.wk)} · 可视化看板</div>
  </div>

  <div class="cc">
    <div class="cc-t">项目健康度总览</div>
    <div class="health-grid">
      ${sorted.map(p=>{
        const riskText = _itemListText(p.risk);
        return `<div class="hc ${sc(p.status)}">
        <div class="hc-nm">${esc(p.name)}</div>
        <div class="hc-stage">${STAGES[p.stage]||'无'} 阶段</div>
        <div class="hc-risks">
          ${riskText&&riskText!=='正常推进'?`<div class="hc-risk">${esc(riskText)}</div>`:'<div class="hc-risk">正常推进</div>'}
        </div>
      </div>`;}).join('')}
    </div>
  </div>

  <div class="cc">
    <div class="cc-t">项目状态分布</div>
    <div class="bch">
      ${(()=>{
        const tot=active.length||1;
        return[
          {lb:'需决策/卡住',cl:'#c0392b',cnt:sc2['r']||0,ps:redProjects},
          {lb:'需关注',cl:'#d4840a',cnt:sc2['y']||0,ps:yelProjects},
          {lb:'正常推进',cl:'#27ae60',cnt:sc2['g']||0,ps:grnProjects}
        ].map(({lb,cl,cnt,ps})=>`<div class="br" style="align-items:flex-start;margin-bottom:6px">
          <div class="bl" style="padding-top:3px">${lb}</div>
          <div style="flex:1;display:flex;flex-direction:column;gap:4px">
            <div style="width:100%;height:20px;background:var(--bdr);border-radius:4px;overflow:hidden">
              <div style="width:${cnt/tot*100}%;height:100%;background:${cl};border-radius:4px;transition:width .4s;${cnt===0?'display:none':''}"></div>
            </div>
            ${cnt>0&&ps?`<div style="display:flex;flex-wrap:wrap;gap:3px">${ps.map(p=>`<span style="font-size:10px;padding:2px 7px;border-radius:3px;background:${cl}22;color:${cl};border:0.5px solid ${cl}55">${esc(p.name.length>10?p.name.slice(0,10)+'…':p.name)}</span>`).join('')}</div>`:''}
          </div>
          <div style="min-width:36px;text-align:right;font-size:12px;font-weight:700;color:${cnt>0?cl:'var(--t3)'};">${cnt} 个</div>
        </div>`).join('');
      })()}
    </div>
  </div>

  <div class="cc">
    <div class="cc-t">各设计阶段分布</div>
    <div class="bch">
      ${STAGES.map((s,i)=>sd[i]?`<div class="br">
        <div class="bl">${s}</div>
        <div class="bt" style="height:18px"><div class="bf" style="width:${Math.round(sd[i]/maxSD*100)}%;background:var(--gold)"></div></div>
        <div class="bv">${sd[i]}个</div>
      </div>`:'').join('')}
      ${sd.every(v=>!v)?`<div class="empty">暂无数据</div>`:''}
    </div>
  </div>

  ${tlItems.length?`<div class="cc">
    <div class="cc-t">项目时间轴</div>
    <div class="tlw">
      ${tlItems.map(p=>{
        const cl=p.status==='r'?'#b00020':p.status==='y'?'#9a7200':'#1a6830';
        const s2=p.start?Math.max(0,Math.round((-(p.dFS||0)-minS)/span*100)):0;
        const e2=p.end?Math.min(100,Math.round((span-(p.dTE||0)+(-minS))/span*100)):70;
        const tPct=Math.round(-minS/span*100);
        const barL=Math.max(0,Math.min(s2,e2));
        const barR=Math.min(100,Math.max(barL+2,Math.max(s2,e2)));
        const dc=p.dTE!==null?(p.dTE<=30?'var(--rt)':p.dTE<=60?'var(--yt)':'var(--t3)'):'var(--t3)';
        return`<div class="tlr">
          <div class="tln" title="${esc(p.name)}">${esc(p.name.length>13?p.name.slice(0,13)+'…':p.name)}</div>
          <div class="tlt">
            <div class="tlb" style="left:${barL}%;width:${barR-barL}%;background:${cl}"></div>
            <div style="position:absolute;top:-4px;left:${tPct}%;width:1px;height:calc(100% + 8px);border-left:2px dashed var(--rt);opacity:.7;z-index:2"></div>
          </div>
          <div class="tlds" style="color:${dc}">${p.dTE!==null?p.dTE+'天':'无'}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="font-size:10px;color:var(--t3);margin-top:7px">虚线=今天 · 数字=距竣工天数</div>
  </div>`:''}

  <div class="cc">
    <div class="cc-t">本周行动汇总</div>
    <div class="ali">
      ${snaps.map((p,idx)=>`<div class="ai">
        <div style="flex-shrink:0;width:20px;height:20px;border-radius:50%;background:var(--gl);color:var(--gold);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${idx+1}</div>
        <div><div class="badge ${sc(p.status)}" style="font-size:10px;margin-bottom:3px">${esc(p.name.length>8?p.name.slice(0,8)+'…':p.name)}</div></div>
        <div class="at">${esc(_itemListText(p.coreAction)||p.next||'无')}</div>
      </div>`).join('')}
      ${!snaps.length?`<div class="empty">暂无数据</div>`:''}
    </div>
  </div>`;
}
