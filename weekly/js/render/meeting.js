// ════════════════════════════════════════════════════
// render/meeting.js — 本周会议渲染 + CRUD
// ════════════════════════════════════════════════════

function getMeetings(yr,wk){ return(LW()[wkKey(yr,wk)]||{}).__meetings||[]; }
function setMeetings(yr,wk,meetings){ const w=LW(),k=wkKey(yr,wk); if(!w[k])w[k]={}; w[k].__meetings=meetings; SW(w); }

function renderMeeting(){
  const meetings=getMeetings(S.yr,S.wk);

  // 渲染编辑表单
  if(S.meetingEditId!==null){
    const mf=S.meetingForm||{title:'',time:'',initiator:'',attendees:'',content:'',issues:''};
    return`
    <div class="io-bar no-print">
      <button class="bs" onclick="cancelMeeting()">← 返回</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">${S.meetingEditId===0?'新增会议':'编辑会议'}</div>
    </div>
    <div class="fc">
      <div class="fg">
        <div class="ff" style="grid-column:1/-1"><label>会议名称 *</label>
          <input value="${esc(mf.title)}" placeholder="例：西安熙地港方案汇报会" oninput="S.meetingForm.title=this.value"></div>
        <div class="ff"><label>会议时间</label>
          <input type="datetime-local" value="${toDateTimeLocal(mf.time)}" onchange="S.meetingForm.time=fromDateTimeLocal(this.value)"></div>
        <div class="ff"><label>发起人</label>
          <input value="${esc(mf.initiator)}" placeholder="姓名" oninput="S.meetingForm.initiator=this.value"></div>
        <div class="ff" style="grid-column:1/-1"><label>参与人</label>
          <input value="${esc(mf.attendees)}" placeholder="例：张三、李四、设计公司王总" oninput="S.meetingForm.attendees=this.value"></div>
        <div class="ff" style="grid-column:1/-1"><label>主要内容</label>
          <textarea class="auto-h" placeholder="会议主要讨论内容和结论" oninput="S.meetingForm.content=this.value">${esc(mf.content)}</textarea></div>
        <div class="ff" style="grid-column:1/-1"><label>需要解决的问题（无则留空）</label>
          <textarea class="auto-h" placeholder="例：业主需3天内确认平面方案" oninput="S.meetingForm.issues=this.value">${esc(mf.issues)}</textarea></div>
      </div>
      <div class="ar">
        <button class="bs" onclick="cancelMeeting()">取消</button>
        <button class="bp" onclick="saveMeeting()">保存</button>
      </div>
    </div>`;
  }

  const renderMCard=(m,idx)=>`
  <div style="background:var(--card);border:0.5px solid var(--bdr);border-radius:var(--r);padding:14px 16px;margin-bottom:9px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:22px;height:22px;border-radius:50%;background:var(--gl);color:var(--gold);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${idx+1}</div>
        <div style="font-size:14px;font-weight:700">${esc(m.title)||'（未命名）'}</div>
      </div>
      ${m.time?`<div style="font-size:11px;color:var(--t3)">${esc(m.time)}</div>`:''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:8px">
      <div style="background:var(--bg);border-radius:var(--rr);padding:7px 10px"><div style="font-size:10px;color:var(--t3);font-weight:700;margin-bottom:3px">发起人</div><div>${esc(m.initiator||'—')}</div></div>
      <div style="background:var(--bg);border-radius:var(--rr);padding:7px 10px"><div style="font-size:10px;color:var(--t3);font-weight:700;margin-bottom:3px">参与人</div><div>${esc(m.attendees||'—')}</div></div>
      <div style="background:var(--bg);border-radius:var(--rr);padding:7px 10px;grid-column:1/-1"><div style="font-size:10px;color:var(--t3);font-weight:700;margin-bottom:3px">主要内容</div><div style="line-height:1.5">${esc(m.content||'—')}</div></div>
      ${m.issues?`<div style="background:var(--rb);border:0.5px solid var(--rbd);border-radius:var(--rr);padding:7px 10px;grid-column:1/-1"><div style="font-size:10px;color:var(--rt);font-weight:700;margin-bottom:3px">需要解决的问题</div><div style="color:var(--rt);line-height:1.5">${esc(m.issues)}</div></div>`:''}
    </div>
    <div class="io-bar no-print" style="justify-content:flex-end;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--bdr)">
      <button class="io-btn" onclick="submitMeeting(${m.id})">☁ 会议提交</button>
      <button class="bs" style="font-size:11px;padding:4px 9px" onclick="editMeeting(${m.id})">编辑</button>
      <button class="bd" onclick="delMeeting(${m.id})">删除</button>
    </div>
  </div>`;

  return`
  <div class="print-hd"><h1>华力集团 · 研策部本周重点会议</h1><p>${wkLabel(S.yr,S.wk)}（${wkRange(S.yr,S.wk)}）</p></div>
  <div class="io-bar no-print">
    <button class="io-btn" onclick="newMeeting()">＋ 新增会议</button>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div>
      <div style="font-size:14px;font-weight:700">本周重点会议</div>
      <div style="font-size:11px;color:var(--t3);margin-top:2px">${wkLabel(S.yr,S.wk)} · ${wkRange(S.yr,S.wk)}</div>
    </div>
  </div>
  ${meetings.length?meetings.map(renderMCard).join(''):`<div class="empty">本周暂无会议记录，点击右上角「新增会议」添加</div>`}`;
}

window.newMeeting=function(){
  S.meetingEditId=0;
  S.meetingForm={id:Date.now(),title:'',time:'',initiator:_currentUser||'',attendees:'',content:'',issues:''};
  render();
};
window.editMeeting=function(id){
  const m=getMeetings(S.yr,S.wk).find(x=>x.id===id);
  if(!m)return;
  S.meetingEditId=id; S.meetingForm={...m}; render();
};
window.cancelMeeting=function(){ S.meetingEditId=null; S.meetingForm=null; render(); };
window.saveMeeting=async function(){
  const mf=S.meetingForm;
  if(!mf||!mf.title.trim()){alert('请填写会议名称');return;}
  const ms=getMeetings(S.yr,S.wk);
  let updatedList;
  if(S.meetingEditId===0){
    const newMeetingObj = {...mf, id: Date.now()};
    updatedList = [...ms, newMeetingObj];
  }else{
    updatedList = ms.map(m=>m.id===S.meetingEditId?{...mf}:m);
  }
  setMeetings(S.yr,S.wk,updatedList);
  S.meetingEditId=null; S.meetingForm=null; render();
  
  // 自动同步到云端
  if(_syncOk && syncConfigured()){
    showSyncStatus('saving');
    try{
      const remoteId = 'meeting_' + S.yr + '_' + S.wk;
      await _dbSet(remoteId, {data: updatedList, _v: Date.now()});
      showSyncStatus('saved');
      setTimeout(() => showSyncStatus('sync'), 2000);
    }catch(e){
      console.error('保存会议同步失败:', e);
      showSyncStatus('err');
    }
  }
};
window.delMeeting=async function(id){
  if(!confirm('确认删除该会议记录？'))return;
  
  // 先本地删除
  setMeetings(S.yr,S.wk,getMeetings(S.yr,S.wk).filter(m=>m.id!==id));
  render();
  
  // 同步删除到云端
  if(_syncOk && syncConfigured()){
    showSyncStatus('saving');
    try{
      const remoteId = 'meeting_' + S.yr + '_' + S.wk;
      const rec = await _dbGet(remoteId);
      if(rec && rec.data){
        const updatedList = rec.data.filter(m => m.id !== id);
        await _dbSet(remoteId, {data: updatedList, _v: Date.now()});
        showSyncStatus('saved');
        setTimeout(() => showSyncStatus('sync'), 2000);
        _showOfflineToast('会议已删除并同步到云端', 'online');
      }
    }catch(e){
      console.error('删除会议同步失败:', e);
      showSyncStatus('err');
      _showOfflineToast('删除同步失败，将重试', 'pending');
    }
  }
};

// 会议提交到云端
window.submitMeeting=async function(id){
  const m = getMeetings(S.yr,S.wk).find(x => x.id === id);
  if(!m){ alert('会议不存在'); return; }
  
  if(!syncConfigured()){ alert('云端未配置'); return; }
  if(!_syncOk){
    // 离线：存入本地队列
    const remoteId = 'meeting_' + S.yr + '_' + S.wk + '_' + id;
    const newV = String(Date.now());
    _queueAdd({id: remoteId, obj: {...m, _v: newV, _updatedBy: _currentUser, _updatedAt: new Date().toLocaleString('zh-CN')}, extra: undefined, ts: Date.now()});
    _showOfflineToast('网络不可用，已存入本地队列');
    return;
  }
  
  showSyncStatus('saving');
  try{
    const remoteId = 'meeting_' + S.yr + '_' + S.wk;
    let meetingList = [];
    try{
      const rec = await _dbGet(remoteId);
      meetingList = (rec && rec.data) || [];
    }catch(e){}
    
    const idx = meetingList.findIndex(x => x.id === id);
    const updatedM = {...m, _updatedBy: _currentUser, _updatedAt: new Date().toLocaleString('zh-CN')};
    if(idx >= 0){
      meetingList[idx] = updatedM;
    }else{
      meetingList.push(updatedM);
    }
    
    await _dbSet(remoteId, {data: meetingList, _v: Date.now()});
    showSyncStatus('saved');
    setTimeout(() => showSyncStatus('sync'), 2000);
    _showOfflineToast('会议已提交到云端', 'online');
  }catch(e){
    console.error('submitMeeting error:', e);
    showSyncStatus('err');
    alert('会议提交失败：' + e.message);
  }
};
