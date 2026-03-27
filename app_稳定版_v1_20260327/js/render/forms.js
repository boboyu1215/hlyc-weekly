// ════════════════════════════════════════════════════
// render/forms.js — 项目表单 & 周报表单渲染
// ════════════════════════════════════════════════════

function renderProjForm(){
  const f=S.form; const isEdit=S.editId!==null;
  const sp=STAGES.map((s,i)=>`<div class="spi ${i<f.defStage?'ds':i===f.defStage?'as':''}" onclick="setStage(${i})">${esc(s)}</div>`).join('');
  function toDateInput(v){ return v?(v.replace(/\//g,'-')):''; }
  return`
  <div class="io-bar no-print">
    <span id="_sync_label_input" class="io-btn" style="cursor:default">☁ 已同步</span>
    <button class="io-btn" onclick="ST('weekly')">← 返回</button>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="font-size:14px;font-weight:700">${isEdit?'编辑项目':'新增项目'}</div>
  </div>
  <div class="fc">
    <div class="fc-t">项目基本信息</div>
    <div class="fg">
      <div class="ff" style="grid-column:1/-1"><label>项目名称 *</label>
        <input value="${esc(f.name)}" placeholder="例：杭州湖滨银泰 IN77" oninput="UF('name',this.value)">
      </div>
      <div class="ff"><label>项目面积</label>
        <input value="${esc(f.area||'')}" placeholder="例：3500㎡" oninput="UF('area',this.value)">
      </div>
      <div class="ff"><label>筹备负责人</label>
        <input value="${esc(f.prepOwner||'')}" placeholder="姓名" oninput="UF('prepOwner',this.value)">
      </div>
      <div class="ff"><label>研策负责人</label>
        <input value="${esc(f.designOwner||'')}" placeholder="姓名" oninput="UF('designOwner',this.value)">
      </div>
    </div>

    <div class="fc-sub">关键时间节点</div>
    <div class="fg g3">
      <div class="ff"><label>设计启动时间</label>
        <input type="date" value="${toDateInput(f.startDate)}" onchange="UF('startDate',this.value.replace(/-/g,'/'))">
      </div>
      <div class="ff"><label>方案设计完成</label>
        <input type="date" value="${toDateInput(f.schemeDate)}" onchange="UF('schemeDate',this.value.replace(/-/g,'/'))">
      </div>
      <div class="ff"><label>设计完成时间</label>
        <input type="date" value="${toDateInput(f.designDate)}" onchange="UF('designDate',this.value.replace(/-/g,'/'))">
      </div>
      <div class="ff"><label>进场时间</label>
        <input type="date" value="${toDateInput(f.siteDate)}" onchange="UF('siteDate',this.value.replace(/-/g,'/'))">
      </div>
      <div class="ff"><label>竣工时间</label>
        <input type="date" value="${toDateInput(f.completionDate)}" onchange="UF('completionDate',this.value.replace(/-/g,'/'))">
      </div>
      <div class="ff"><label>开业时间</label>
        <input type="date" value="${toDateInput(f.openDate)}" onchange="UF('openDate',this.value.replace(/-/g,'/'))">
      </div>
    </div>

    <div class="fc-sub">默认状态</div>
    <div class="ff" style="margin-bottom:11px">
      <label>默认项目状态</label>
      <div class="ssel">
        <div class="sopt${(f.defStatus||'g')==='r'?' sr':''}" onclick="UF('defStatus','r');render()">🔴 需决策/卡住</div>
        <div class="sopt${(f.defStatus||'g')==='y'?' sy':''}" onclick="UF('defStatus','y');render()">🟡 需关注</div>
        <div class="sopt${(f.defStatus||'g')==='g'?' sg':''}" onclick="UF('defStatus','g');render()">🟢 正常推进</div>
      </div>
    </div>
    <div class="ff"><label>默认当前阶段</label>
      <div class="spk">${sp}</div>
    </div>

    <div class="ar">
      <button class="bs" onclick="ST('weekly')">取消</button>
      <button class="bp" onclick="saveProj()">${isEdit?'保存':'创建项目'}</button>
    </div>
  </div>`;
}

// ── 动态列表组件辅助 ──
// 将字段值标准化为数组（兼容旧字符串格式）
function _toItemList(v){
  if(!v||v==='无'||v==='') return [{text:'',dueDate:''}];
  if(Array.isArray(v)) return v.length?v:[{text:'',dueDate:''}];
  // 旧字符串：按换行拆分
  return v.split('\n').filter(s=>s.trim()).map(s=>({text:s,dueDate:''})).concat([{text:'',dueDate:''}]);
}

// 将 "2026-03-28" 格式转为只显示 "3/28" 的标签文字
function _dueDateLabel(d){
  if(!d) return '';
  const m = d.match(/\d{4}-(\d{2})-(\d{2})/);
  if(!m) return d;
  return `${parseInt(m[1])}/${parseInt(m[2])}`;
}

// 渲染一个动态列表区块（纯回车增行，无按钮；日期用自定义月/日选择）
// fieldKey: S.wform 中的字段名，placeholder: 输入框占位符，onChangeExtra: 额外回调名
function _renderItemList(fieldKey, placeholder, onChangeExtra){
  const items = _toItemList(S.wform[fieldKey]);
  S.wform[fieldKey] = items;
  return `<div class="item-list" data-field="${fieldKey}">
    ${items.map((item,i)=>`
    <div class="item-row" data-idx="${i}">
      <span class="item-no">${i+1}.</span>
      <input class="item-text" type="text" value="${esc(item.text)}"
        placeholder="${i===0?placeholder:'继续添加…'}"
        onkeydown="itemKeydown(event,'${fieldKey}',${i})"
        oninput="itemInput(event,'${fieldKey}',${i}${onChangeExtra?`,'${onChangeExtra}'`:''})">
      <label class="item-date-wrap" title="点击设置完成时间">
        <span class="item-date-lbl${item.dueDate?' has-date':''}">${item.dueDate?_dueDateLabel(item.dueDate):'📅'}</span>
        <input class="item-date-hidden" type="date" value="${item.dueDate||''}"
          onchange="itemDateChange(event,'${fieldKey}',${i})">
      </label>
      <button class="item-del" title="删除此行" onclick="itemDel('${fieldKey}',${i})" tabindex="-1">×</button>
    </div>`).join('')}
  </div>`;
}

function renderWkForm(){
  const f=S.wform;
  const p=LP().find(x=>x.id===S.wkEditId);
  if(!p) return `<div class="empty">项目不存在</div>`;
  const sp=STAGES.map((s,i)=>`<div class="spi ${i<f.stage?'ds':i===f.stage?'as':''}" onclick="setWkStage(${i})">${esc(s)}</div>`).join('');
  return`
  <div class="io-bar no-print">
    <span id="_sync_label_wkinput" class="io-btn" style="cursor:default">☁ 已同步</span>
    <button class="io-btn" onclick="ST('weekly')">← 返回</button>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div>
      <div style="font-size:14px;font-weight:700">更新本周状态</div>
      <div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(p.name)} · ${wkLabel(S.yr,S.wk)}</div>
    </div>
  </div>
  <div class="fc">
    <div class="fc-t" style="font-size:12px;color:var(--t2);font-weight:400">未改动的字段将自动继承上周数据，只填有变化的内容即可</div>

    <div class="ff" style="margin-bottom:11px">
      <label>项目状态</label>
      <div class="ssel">
        <div class="sopt${f.status==='r'?' sr':''}" onclick="UW('status','r');render()">🔴 需决策/卡住</div>
        <div class="sopt${f.status==='y'?' sy':''}" onclick="UW('status','y');render()">🟡 需关注</div>
        <div class="sopt${f.status==='g'?' sg':''}" onclick="UW('status','g');render()">🟢 正常推进</div>
      </div>
    </div>

    <div class="ff" style="margin-bottom:11px">
      <label>当前阶段</label>
      <div class="spk">${sp}</div>
    </div>

    <div class="fc-sub d1">维度一：上周工作完成情况</div>
    <div class="fg full">
      <div class="ff"><label>上周完成的主要工作</label>
        <textarea class="auto-h" id="_ta_coreOutput" placeholder="上周完成的主要成果" oninput="UW('coreOutput',this.value);autoH(this)">${esc(f.coreOutput)}</textarea>
      </div>
    </div>

    <div class="fc-sub d2">维度二：本周计划</div>
    <div class="ff full" style="margin-bottom:6px">
      <label>本周必须完成的关键事项 <span style="font-weight:400;color:var(--t3)">（回车增加一行，📅 设置完成时间）</span></label>
      ${_renderItemList('coreAction','例：完成深化方案并提交大区','')}
    </div>

    <div class="fc-sub d1">维度三：风险 / 卡点</div>
    <div style="font-size:11px;color:var(--rt);margin-bottom:6px;padding:4px 8px;background:var(--rb);border-radius:var(--rr);border:0.5px solid var(--rbd)">
      ⚠ 填入风险内容或需管理层决策的事后，项目状态将自动标记为「需决策/卡住」
    </div>
    <div class="ff full" style="margin-bottom:6px">
      <label>最大风险 / 已卡住的问题 <span style="font-weight:400;color:var(--t3)">（回车增加一行）</span></label>
      ${_renderItemList('risk',"本周最大的风险或已卡住的问题",'autoStatus')}
    </div>
    <div class="ff full" style="margin-bottom:6px">
      <label>需管理层决策的事 <span style="font-weight:400;color:var(--t3)">（回车增加一行）</span></label>
      ${_renderItemList('decision','需要管理层决策或协调的事项','autoStatus')}
    </div>

    <div class="fc-sub d3">维度四：跨部门支援</div>
    <div class="ff full" style="margin-bottom:6px">
      <label>本周需要哪些部门协助 <span style="font-weight:400;color:var(--t3)">（无则留空，回车增加一行）</span></label>
      ${_renderItemList('crossDept','例：需采购部协助核价2项','')}
    </div>

    <div class="ar">
      <button class="bs" onclick="ST('weekly')">取消</button>
      <button class="bp" onclick="saveWk()">保存本周状态</button>
    </div>
  </div>`;
}

// ── 动态列表交互函数 ──

// 判断列表是否有实际内容（用于 autoStatus）
function _itemListHasContent(v){
  if(!v) return false;
  if(Array.isArray(v)) return v.some(item=>item.text&&item.text.trim()&&item.text.trim()!=='无');
  if(typeof v==='string') return v.trim().length>0 && v.trim()!=='无';
  return false;
}

// 将列表中某行的文本更新到 S.wform
window.itemInput=function(e, fieldKey, idx, extraCb){
  const items = Array.isArray(S.wform[fieldKey]) ? S.wform[fieldKey] : _toItemList(S.wform[fieldKey]);
  items[idx] = {...(items[idx]||{}), text: e.target.value};
  S.wform[fieldKey] = items;
  if(extraCb && window[extraCb]) window[extraCb]();
};

// 更新某行的日期，并同步更新标签文字（无需整体 render）
window.itemDateChange=function(e, fieldKey, idx){
  const items = Array.isArray(S.wform[fieldKey]) ? S.wform[fieldKey] : _toItemList(S.wform[fieldKey]);
  const val = e.target.value;
  items[idx] = {...(items[idx]||{}), dueDate: val};
  S.wform[fieldKey] = items;
  // 直接更新对应标签，无需整体 render
  const lbl = e.target.closest('.item-date-wrap')?.querySelector('.item-date-lbl');
  if(lbl){
    lbl.textContent = val ? _dueDateLabel(val) : '📅';
    lbl.classList.toggle('has-date', !!val);
  }
};

// 回车自动在当前行后插入新行
window.itemKeydown=function(e, fieldKey, idx){
  if(e.key!=='Enter') return;
  e.preventDefault();
  const items = Array.isArray(S.wform[fieldKey]) ? [...S.wform[fieldKey]] : _toItemList(S.wform[fieldKey]);
  items.splice(idx+1, 0, {text:'', dueDate:''});
  S.wform[fieldKey] = items;
  render();
  // 聚焦到新行
  requestAnimationFrame(()=>{
    const rows = document.querySelectorAll(`.item-list[data-field="${fieldKey}"] .item-text`);
    if(rows[idx+1]) rows[idx+1].focus();
  });
};

// 删除某行
window.itemDel=function(fieldKey, idx){
  let items = Array.isArray(S.wform[fieldKey]) ? [...S.wform[fieldKey]] : _toItemList(S.wform[fieldKey]);
  items.splice(idx, 1);
  if(!items.length) items = [{text:'', dueDate:''}];
  S.wform[fieldKey] = items;
  render();
};

// ── 状态自动联动 ──
window.autoStatus=function(){
  const hasRisk = _itemListHasContent(S.wform.risk);
  const hasDec  = _itemListHasContent(S.wform.decision);
  const target=hasRisk||hasDec?'r':'g';
  if(S.wform.status===target)return;
  S.wform.status=target;
  document.querySelectorAll('.sopt').forEach(el=>{
    el.classList.remove('sr','sy','sg');
    if(el.textContent.includes('需决策')&&target==='r')el.classList.add('sr');
    if(el.textContent.includes('需关注')&&target==='y')el.classList.add('sy');
    if(el.textContent.includes('正常推进')&&target==='g')el.classList.add('sg');
  });
};

// ── 项目表单操作 ──
window.UF=function(k,v){S.form[k]=v;};
window.setStage=function(i){S.form.defStage=i;render();};
window.editProj=function(id){ const p=LP().find(x=>x.id===id);if(!p)return; S.editId=id;S.form={...p};S.tab='input';render(); };
window.saveProj=function(){
  const f=S.form;if(!f.name.trim()){alert('请填写名称');return;}
  const ps=LP();
  if(S.editId!==null){ SP(ps.map(p=>p.id===S.editId?{...p,...f}:p)); }else{
    const id=Math.max(0,...ps.map(p=>p.id),0)+1; const sortOrder=ps.filter(p=>!p.archived).length;
    SP([...ps,{id,...f,archived:false,sortOrder}]); setSnap(S.yr,S.wk,id,{status:f.defStatus||'g',stage:f.defStage||0,risk:'',next:'',decision:'无',coreOutput:'',coreAction:'',incident:'',crossDept:'',knowledge:''});
  }
  S.editId=null;S.tab='weekly';render();
};

// 项目信息提交到云端（项目总览用）
window.submitProjectInfo=async function(projId){
  const p = LP().find(x => x.id === projId);
  if(!p){ alert('项目不存在'); return; }
  if(!syncConfigured()){ alert('云端未配置'); return; }
  if(!_syncOk){
    const remoteId = 'projinfo_' + projId;
    const newV = String(Date.now());
    _queueAdd({id: remoteId, obj: {...p, _v: newV, _updatedBy: _currentUser, _updatedAt: new Date().toLocaleString('zh-CN')}, extra: undefined, ts: Date.now()});
    _showOfflineToast('网络不可用，已存入本地队列，恢复后自动同步');
    return;
  }
  showSyncStatus('saving');
  try{
    let projList = [];
    try{ const rec = await _dbGet('projects'); projList = (rec && rec.projects) || []; }catch(e){}
    const idx = projList.findIndex(x => x.id === projId);
    const updatedP = {...p, _updatedBy: _currentUser, _updatedAt: new Date().toLocaleString('zh-CN')};
    if(idx >= 0){ projList[idx] = updatedP; }else{ projList.push(updatedP); }
    await _dbSet('projects', {projects: projList, _v: Date.now()});
    showSyncStatus('saved');
    setTimeout(() => showSyncStatus('sync'), 2000);
    _showOfflineToast('项目信息已提交到云端', 'online');
  }catch(e){
    console.error('submitProjectInfo error:', e);
    showSyncStatus('err');
    alert('项目提交失败：' + e.message);
  }
};

// ── 周报表单操作 ──
window.UW=function(k,v){S.wform[k]=v;};
window.setWkStage=function(i){S.wform.stage=i;render();};
window.openWkEdit=function(id){ S.wkEditId=id;S.wform={...blankWkForm(id)};S.tab='wkinput';render(); };
window.saveWk=function(){
  const f={...S.wform};
  // ── 日期必填校验：有文字的条目必须有完成时间 ──
  const NEED_DATE_FIELDS = [
    {key:'coreAction', label:'本周计划'},
    {key:'risk',       label:'最大风险/卡点'},
    {key:'decision',   label:'需管理层决策的事'},
    {key:'crossDept',  label:'跨部门支援'},
  ];
  for(const {key, label} of NEED_DATE_FIELDS){
    const items = f[key];
    if(!Array.isArray(items)) continue;
    const missing = items.filter(item => item.text && item.text.trim() && !item.dueDate);
    if(missing.length){
      // 高亮对应缺失日期的行
      requestAnimationFrame(()=>{
        document.querySelectorAll(`.item-list[data-field="${key}"] .item-row`).forEach((row,i)=>{
          const item = items[i];
          if(item && item.text && item.text.trim() && !item.dueDate){
            const lbl = row.querySelector('.item-date-lbl');
            if(lbl){ lbl.style.borderColor='var(--rt)'; lbl.style.color='var(--rt)'; lbl.style.background='var(--rb)'; }
            setTimeout(()=>{ if(lbl){ lbl.style.borderColor=''; lbl.style.color=''; lbl.style.background=''; } }, 3000);
          }
        });
      });
      _showSaveAlert(label);
      return;
    }
  }
  // 清除列表字段的空白行，再保存
  ['coreAction','risk','decision','crossDept'].forEach(key=>{
    if(Array.isArray(f[key])){
      const cleaned = f[key].filter(item=>item.text&&item.text.trim());
      f[key] = cleaned.length ? cleaned : [];
    }
  });
  setSnap(S.yr,S.wk,S.wkEditId,_stampSnap(f));
  // 标记为待提交（已改未提交）
  addPendingSubmit(S.wkEditId);
  S.tab='weekly'; render();
};

// ── 归档/删除弹窗 ──
// 自定义提示弹窗（用于校验提示，避免原生 alert 风格）
function _showSaveAlert(fieldLabel){
  let el=document.getElementById('_save_alert_toast');
  if(!el){
    el=document.createElement('div');
    el.id='_save_alert_toast';
    el.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:9999;background:var(--card);border:1.5px solid var(--rt);border-radius:var(--r);
      padding:24px 28px;box-shadow:0 8px 32px rgba(0,0,0,.22);font-family:var(--fn);
      max-width:360px;width:90%;`;
    document.body.appendChild(el);
  }
  el.innerHTML=`
    <div style="font-size:26px;margin-bottom:10px;text-align:center">⚠️</div>
    <div style="font-size:14px;font-weight:700;color:var(--rt);margin-bottom:10px;text-align:center">有项目未确认完成时间，请补充后再提交</div>
    <div style="font-size:12px;color:var(--t2);line-height:1.9;text-align:center;margin-bottom:16px;padding:8px 12px;background:var(--rb);border-radius:var(--rr)">
      「<strong>${esc(fieldLabel)}</strong>」中有内容未选择 📅 完成时间<br>
      <span style="color:var(--t3)">请为每条有文字的事项补充完成时间</span>
    </div>
    <button style="width:100%;padding:10px;background:var(--gold);color:#fff;border:none;border-radius:var(--rr);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--fn)" onclick="document.getElementById('_save_alert_toast').style.display='none'">好的，去补充</button>
  `;
  el.style.display='block';
}

window.askArch=function(id){ S.pendingArchId=id; document.getElementById('arch-modal').style.display='flex'; };
window.clArch=function(){document.getElementById('arch-modal').style.display='none';};
window.cfArch = function(){
  if(!confirm('确定要归档该项目吗？归档后不再显示在项目总览中。')) return;
  const pwd = document.getElementById('arch-pwd').value;
  if(pwd !== DEL_PWD){
    document.getElementById('arch-err').style.display = 'block';
    return;
  }
  document.getElementById('arch-err').style.display = 'none';
  SP(LP().map(p=>p.id===S.pendingArchId?{...p,archived:true}:p));
  clArch(); render();
};
window.askDel = function(id){ S.pendingDelId=id; document.getElementById('del-modal').style.display='flex'; };
window.clDel  = function(){document.getElementById('del-modal').style.display='none';};
window.cfDel  = function(){
  const pwd = document.getElementById('del-pwd').value;
  if(pwd !== DEL_PWD){
    document.getElementById('del-err').style.display = 'block';
    return;
  }
  document.getElementById('del-err').style.display = 'none';
  SP(LP().filter(p => p.id !== S.pendingDelId));
  clDel(); render();
};

// ── 提交弹窗（带Diff预览）──
window.askSubmitProject=function(projId){
  if(!_syncOk&&syncConfigured()){ alert('云端未连接，请稍后再试');return; }
  const proj=LP().find(p=>p.id===projId); if(!proj)return;
  const m=document.getElementById('submit-modal');
  m.querySelector('h3').textContent='📤 提交「'+proj.name+'」';

  document.getElementById('submit-diff').innerHTML=
    '<div style="color:var(--t3);padding:20px 0;text-align:center;font-size:12px">⏳ 正在对比云端数据…</div>';
  document.getElementById('submit-confirm-btn').onclick=null;
  document.getElementById('submit-cancel-btn').onclick=()=>{ m.style.display='none'; };
  m.style.display='flex';

  (async()=>{
    const remoteRec = await _dbGet('snap_'+projId).catch(()=>null);
    const remote = remoteRec ? remoteRec.data : null;
    const localSnap = LW_proj(projId);
    const SNAP_FIELDS = ['status','stage','risk','coreOutput','coreAction','decision','crossDept'];
    const wkeys = Object.keys(localSnap)
      .filter(k=>!['_v','_updatedBy','_updatedAt'].includes(k))
      .sort().reverse();

    let html = '';
    let hasChanges = false;

    wkeys.forEach(wk=>{
      const ls = localSnap[wk];
      const rs = (remote && remote[wk]) ? remote[wk] : {};
      const diffs = SNAP_FIELDS.map(k=>{
        const ov = fieldVal(k, rs[k]);
        const nv = fieldVal(k, ls[k]);
        return ov!==nv ? {label:FIELD_LABELS[k]||k, from:ov, to:nv} : null;
      }).filter(Boolean);

      if(diffs.length){
        hasChanges = true;
        html += `<div class="diff-section-title">📅 ${wk}</div><div class="diff-proj">`;
        diffs.forEach(d=>{
          const fromTxt = d.from.length>28 ? d.from.slice(0,28)+'…' : d.from;
          const toTxt   = d.to.length>28   ? d.to.slice(0,28)+'…'   : d.to;
          html += `<div class="diff-row">
            <span class="diff-field">${esc(d.label)}</span>
            <span class="diff-from">${esc(fromTxt)}</span>
            <span class="diff-arrow">→</span>
            <span class="diff-to">${esc(toTxt)}</span>
          </div>`;
        });
        html += '</div>';
      }
    });

    if(!hasChanges){
      html = `<div style="color:var(--gt);padding:14px 0;text-align:center;font-size:12px">
        ✓ 与云端数据一致，无变更内容<br>
        <span style="color:var(--t3);font-size:11px">仍可点击确认提交以刷新时间戳</span>
      </div>`;
    }

    const t = new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    html += `<div class="diff-meta">提交人：${esc(_currentUser)} · ${t}</div>`;
    document.getElementById('submit-diff').innerHTML = html;

    document.getElementById('submit-confirm-btn').onclick = async()=>{
      m.style.display='none';
      const ok = await submitProject(projId);

      if(ok === 'queued'){
        const el2=document.getElementById('submit-result');
        el2.innerHTML='<div style="font-size:28px;margin-bottom:8px">📥</div>已存入本地队列<div style="font-size:12px;color:var(--t3);font-weight:400;margin-top:6px">网络恢复后自动上传</div>';
        el2.style.color='var(--yt)';
        document.getElementById('submit-result-modal').style.display='flex';
        return;
      }
      if(ok === 'CONFLICT'){
        alert('❌ 提交被拦截：云端数据刚刚已被他人更新！\n\n系统将自动为您拉取最新数据，请重新核对后再提交。');
        await pullProject(projId); render(); return;
      }
      if(ok){
        const ps=LP().map(p=>p.id===projId?{...p,
          _updatedBy:_currentUser,
          _updatedAt:new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
        }:p);
        localStorage.setItem('hlzc_p',JSON.stringify(ps));
        await _saveMainBin({projects:ps,_v:Date.now()});
      }
      const el=document.getElementById('submit-result');
      el.innerHTML=ok
        ?`<div style="font-size:32px;margin-bottom:8px">✅</div>提交成功！<div style="font-size:12px;color:var(--t3);font-weight:400;margin-top:6px">其他人刷新后即可看到最新数据</div>`
        :`<div style="font-size:32px;margin-bottom:8px">❌</div>提交失败，请检查网络后重试`;
      el.style.color=ok?'var(--gt)':'var(--rt)';
      document.getElementById('submit-result-modal').style.display='flex';
      if(ok) render();
    };
  })();
};
