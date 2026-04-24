// ════════════════════════════════════════════════════
// storage.js — 本地存储读写 + 数据模型
// ════════════════════════════════════════════════════

// 活动日志 key
const _ACT_KEY = 'hlzc_activity';

// ── 性能优化：内存缓存层 ──
let _projectsCache = null;
let _weeksCache = null;
let _activityCache = null;

// 清除缓存（用于强制刷新）
function _clearCache(){
  _projectsCache = null;
  _weeksCache = null;
  _activityCache = null;
}

// 项目列表读写（带缓存）
function LP(){
  if(_projectsCache !== null) return _projectsCache;
  try{
    _projectsCache = JSON.parse(localStorage.getItem('hlzc_p')||'[]');
    return _projectsCache;
  }catch{
    _projectsCache = [];
    return [];
  }
}

function SP(ps){
  _projectsCache = ps; // 更新缓存
  localStorage.setItem('hlzc_p', JSON.stringify(ps));
  if(_syncOk){
    showSyncStatus('saving');
    _dbSet('projects',{projects:ps,_v:Date.now()})
      .then(()=>{showSyncStatus('saved');setTimeout(()=>showSyncStatus('sync'),2000);})
      .catch(()=>showSyncStatus('err'));
  }
}

// 周报数据读写（带缓存）
function LW(){
  if(_weeksCache !== null) return _weeksCache;
  try{
    _weeksCache = JSON.parse(localStorage.getItem('hlzc_w')||'{}');
    return _weeksCache;
  }catch{
    _weeksCache = {};
    return {};
  }
}

function SW(w){
  _weeksCache = w; // 更新缓存
  localStorage.setItem('hlzc_w', JSON.stringify(w));
  markPending();
}

// 某个项目的所有周快照
function LW_proj(projId){
  const all=LW(), result={};
  Object.keys(all).forEach(wk=>{ if(all[wk][projId]!==undefined) result[wk]=all[wk][projId]; });
  return result;
}

// 获取快照（带继承逻辑：找最近一周的历史数据）
function getSnap(yr,wk,pid,projects){
  const weeks=LW(), k=wkKey(yr,wk);

  // 1. 如果当前周有明确保存的数据，直接返回（清除运行时标记）
  if(weeks[k] && weeks[k][pid]!==undefined && weeks[k][pid]._savedWk === k) {
    const snap = {...weeks[k][pid]};
    // 清除运行时标记
    delete snap._inherited;
    delete snap._carryover;
    delete snap._overdue;
    return snap;
  }

  // 2. 否则，查找最近一周的历史数据（继承逻辑）
  const sorted=Object.keys(weeks).filter(x=>x<=k).sort();
  for(let i=sorted.length-1;i>=0;i--){
    if(weeks[sorted[i]] && weeks[sorted[i]][pid]!==undefined){
      const inheritedSnap = {...weeks[sorted[i]][pid]};
      // 标记为继承数据
      inheritedSnap._inherited = true;
      inheritedSnap._inheritedFrom = sorted[i];
      return inheritedSnap;
    }
  }

  // 3. 如果没有任何历史数据，返回项目默认值
  const p=projects.find(x=>x.id===pid);
  return p
    ? {status:p.defStatus||'g', stage:p.defStage||0, risk:'', next:'', decision:'无', coreOutput:'', coreAction:'', incident:'', crossDept:'', knowledge:''}
    : {status:'g', stage:0, risk:'', next:'', decision:'无', coreOutput:'', coreAction:'', incident:'', crossDept:'', knowledge:''};
}

function setSnap(yr,wk,pid,snap){
  const weeks=LW(), k=wkKey(yr,wk);
  if(!weeks[k]) weeks[k]={};

  // 添加 _savedWk 标记，表示这是在哪一周明确保存的
  const snapWithMark = {...snap, _savedWk: k};

  // 清除运行时标记（这些标记不应该被持久化）
  delete snapWithMark._inherited;
  delete snapWithMark._carryover;
  delete snapWithMark._overdue;

  weeks[k][pid]=snapWithMark;
  SW(weeks);
}

// 会议数据
function getMeetings(yr,wk){ return (LW()[wkKey(yr,wk)]||{}).__meetings||[]; }
function setMeetings(yr,wk,meetings){
  const w=LW(), k=wkKey(yr,wk);
  if(!w[k]) w[k]={};
  w[k].__meetings=meetings;
  SW(w);
}

// 空模板
function blankProj(){
  return {name:'',area:'',startDate:'',schemeDate:'',designDate:'',siteDate:'',completionDate:'',openDate:'',prepOwner:'',designOwner:'',defStatus:'g',defStage:0};
}
function blankWkForm(pid){ return getSnap(S.yr,S.wk,pid,LP()); }

// 活动日志（带缓存）
function _getActivity(){
  if(_activityCache !== null) return _activityCache;
  try{
    _activityCache = JSON.parse(localStorage.getItem(_ACT_KEY)||'[]');
    return _activityCache;
  }catch{
    _activityCache = [];
    return [];
  }
}

function _addActivityLog(entry){
  const logs = _getActivity();
  logs.unshift(entry);
  if(logs.length>100) logs.length=100;
  _activityCache = logs; // 更新缓存
  localStorage.setItem(_ACT_KEY, JSON.stringify(logs));
  renderActivityBar();
}

// ── 待提交集合（本地已保存但未提交到云端的项目ID集合）──
const _PENDING_SUBMIT_KEY = 'hlzc_pending_submit';
function getPendingSubmit(){
  try{ return new Set(JSON.parse(localStorage.getItem(_PENDING_SUBMIT_KEY)||'[]')); }catch{ return new Set(); }
}
function addPendingSubmit(projId){
  const s=getPendingSubmit(); s.add(projId);
  localStorage.setItem(_PENDING_SUBMIT_KEY, JSON.stringify([...s]));
}
function clearPendingSubmit(projId){
  const s=getPendingSubmit(); s.delete(projId);
  localStorage.setItem(_PENDING_SUBMIT_KEY, JSON.stringify([...s]));
}

// 种子数据（首次使用时生成示例）
function seed(){
  if(LP().length) return;
  const ps=[{id:1,name:'示例项目',area:'1200㎡',startDate:'',schemeDate:'',designDate:'',siteDate:'',completionDate:'',openDate:'',prepOwner:'张三',designOwner:'李四',archived:false,defStatus:'g',defStage:0}];
  SP(ps);
  const snap={1:{status:'g',stage:0,risk:'',next:'',decision:'无',coreOutput:'示例',coreAction:'',incident:'',crossDept:'',knowledge:''}};
  const weeks=LW(); weeks[wkKey(CYR,CWK)]=snap; SW(weeks);
}
