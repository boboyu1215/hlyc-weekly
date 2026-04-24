// ════════════════════════════════════════════════════
// storage.js — 本地存储读写 + 数据模型
// ════════════════════════════════════════════════════

// 活动日志 key
const _ACT_KEY = 'hlzc_activity';

// 项目列表读写
function LP(){ try{return JSON.parse(localStorage.getItem('hlzc_p')||'[]')}catch{return[]} }
function SP(ps){
  localStorage.setItem('hlzc_p', JSON.stringify(ps));
  if(_syncOk){
    showSyncStatus('saving');
    _dbSet('projects',{projects:ps,_v:Date.now()})
      .then(()=>{showSyncStatus('saved');setTimeout(()=>showSyncStatus('sync'),2000);})
      .catch(()=>showSyncStatus('err'));
  }
}

// 周报数据读写
function LW(){ try{return JSON.parse(localStorage.getItem('hlzc_w')||'{}')}catch{return{}} }
function SW(w){ localStorage.setItem('hlzc_w', JSON.stringify(w)); markPending(); }

// 某个项目的所有周快照
function LW_proj(projId){
  const all=LW(), result={};
  Object.keys(all).forEach(wk=>{ if(all[wk][projId]!==undefined) result[wk]=all[wk][projId]; });
  return result;
}

// ── 判断风险/决策字段是否有实质内容（排除空值、空数组、"无"、纯空白）
function _fieldHasRealContent(v){
  if(v === null || v === undefined) return false;
  if(Array.isArray(v)){
    return v.some(item =>
      item && typeof item.text === 'string' &&
      item.text.trim() !== '' && item.text.trim() !== '无'
    );
  }
  if(typeof v === 'string'){
    const s = v.trim();
    return s !== '' && s !== '无' && s !== '—';
  }
  return false;
}

// ── 修正快照的 status：risk/decision 都为空/无 且 status='r' → 降回 'g'
function _resolveStatus(snap){
  if(!snap) return snap;
  if(snap.status !== 'r') return snap;
  const hasRisk = _fieldHasRealContent(snap.risk);
  const hasDec  = _fieldHasRealContent(snap.decision);
  if(hasRisk || hasDec) return snap;
  return {...snap, status: 'g'};
}

// ── 从历史 coreAction 中提取需要带入本周的条目
//
// 生命周期规则（以完成时间 dueDate 为准）：
//
//   完成时间在上周或更早（dueDate 的所在周 < 当前查看周）
//     → 丢弃，不再显示
//
//   完成时间在当前查看周或更远未来（dueDate 的所在周 >= 当前查看周）
//     → 显示，标「顺延」
//     → 显示范围：从完成时间所在周开始一直显示，到完成时间所在周结束（下周起消失）
//     → 例：dueDate=4/2(W14)，W13不显示，W14显示，W15起消失
//     → 例：dueDate=4/8(W15)，W13不显示，W14显示，W15显示，W16起消失
//
//   来自 KPI 页面（_fromKPI:true）的条目：同上规则，但标「延误」而非「顺延」
//
//   没有 dueDate → 不继承
//
// 参数 thisMonday：当前查看周的周一（Date对象）
function _extractCarryItems(coreAction, thisMonday){
  // ── 兼容旧版字符串格式：旧版 coreAction 可能是换行分隔的字符串
  // 旧版字符串没有 dueDate 信息，无法判断截止日，全部丢弃（不继承）
  if(!Array.isArray(coreAction)) return [];

  const result = [];
  for(const item of coreAction){
    if(!item || !item.text || !item.text.trim()) continue;
    if(!item.dueDate) continue; // 没有截止日：无法判断是否应继承，丢弃

    const d = new Date(item.dueDate);
    d.setHours(0, 0, 0, 0);

    // 截止日在本周周一之前 → 已过期，丢弃
    if(d < thisMonday) continue;

    // 截止日在本周或更远未来 → 继承显示
    // _fromKPI 来的标「延误」，普通事项标「顺延」
    result.push({
      ...item,
      _carryover: !item._fromKPI,  // 普通跨周事项
      _overdue:    !!item._fromKPI, // KPI页面标注的延误
    });
  }
  return result;
}

// ── 判断某个快照是否是该周自己录入保存的（原生快照）
// 只信任 _savedWk 字段（setSnap 保存时写入）
// 旧版数据（无 _savedWk）统一走继承清洗逻辑，但 getSnap 会从中提取内容
function _isOwnSnap(snap, wkKeyStr){
  if(!snap) return false;
  if(snap._savedWk !== undefined) return snap._savedWk === wkKeyStr;
  // 没有 _savedWk → 非原生，允许清洗
  return false;
}

// ── 从旧版快照（无_savedWk）中提取真实内容，用于"第一次继承"时保留原始录入
// 区别于 _extractCarryItems：这里提取所有非空内容，不按日期过滤
function _extractOldSnapContent(snap){
  return {
    coreOutput: snap.coreOutput || '',
    coreAction: Array.isArray(snap.coreAction) ? snap.coreAction : [],
    risk:       Array.isArray(snap.risk)       ? snap.risk       : [],
    decision:   Array.isArray(snap.decision)   ? snap.decision   : [],
    crossDept:  Array.isArray(snap.crossDept)  ? snap.crossDept  : [],
    status:     snap.status || 'g',
    stage:      snap.stage  || 0,
  };
}

// ── 合并跨周继承保护：
// 对于有原生快照的周，检查历史中是否有"应该继承但本周原生快照里没有"的顺延事项
// 规则：从上一个原生快照中提取 dueDate >= 本周周一 的事项，若本周快照里没有同名事项则追加
// 用户若在本周主动删除某事项并保存，该事项不会追加（因为saveWk已经把_carryover标记去掉）
// 只有从未在本周出现过的跨周事项才会追加
function _mergeCarryItems(ownSnap, k, pid, weeks){
  const parsed = k.match(/(\d{4})-W(\d+)/);
  if(!parsed) return ownSnap;
  const yr = +parsed[1], wk = +parsed[2];
  const thisMonday = wkMonday(yr, wk);

  // 找上一个原生基础快照
  const sorted = Object.keys(weeks).filter(x => x < k).sort();
  let baseSnap = null;
  for(let i = sorted.length - 1; i >= 0; i--){
    const ws = weeks[sorted[i]];
    if(!ws || ws[pid] === undefined) continue;
    const c = ws[pid];
    if(c._inherited) continue;
    const hasContent = (typeof c.coreOutput==='string' && c.coreOutput.trim()) ||
      (Array.isArray(c.coreAction) && c.coreAction.some(i=>i&&i.text&&i.text.trim())) ||
      (typeof c.coreAction==='string' && c.coreAction.trim());
    if(c._savedWk !== undefined || hasContent){ baseSnap = c; break; }
  }
  if(!baseSnap) return ownSnap;

  // 提取应该继承的事项（dueDate >= 本周周一）
  const carryItems = _extractCarryItems(baseSnap.coreAction, thisMonday);
  if(!carryItems.length) return ownSnap;

  // 当前本周快照里已有的事项文本集合
  const ownTexts = new Set(
    (Array.isArray(ownSnap.coreAction) ? ownSnap.coreAction : [])
      .map(i => (i.text||'').trim()).filter(Boolean)
  );

  // 追加本周原生快照里没有的跨周事项
  const toAdd = carryItems.filter(i => !ownTexts.has((i.text||'').trim()));
  if(!toAdd.length) return ownSnap;

  return {
    ...ownSnap,
    coreAction: [...(Array.isArray(ownSnap.coreAction)?ownSnap.coreAction:[]), ...toAdd],
  };
}

// ── 获取快照（带继承逻辑）
// 规则：
//   1. 该周有 _savedWk === k 的原生快照 → 直接返回，做状态修正 + 跨周继承保护
//   2. 该周有数据但 _savedWk 不匹配 k（被 _inherited 污染或 _savedWk 指向其他周）
//      → 检查是否有实质内容：有则视为该周原生（向下兼容），无则走继承
//   3. 没有该周快照或仅有继承视图 → 向前找最近的可靠基础，提取顺延/延误项
function getSnap(yr,wk,pid,projects){
  const weeks=LW(), k=wkKey(yr,wk);
  const own = weeks[k] && weeks[k][pid];
  const p   = projects.find(x => x.id === pid);
  const defStatus = p ? (p.defStatus||'g') : 'g';
  const defStage  = p ? (p.defStage||0)    : 0;
  const blank = {status:defStatus, stage:defStage, risk:[], next:'', decision:[], coreOutput:'', coreAction:[], incident:'', crossDept:[], knowledge:''};

  // 情况1：本周有 _savedWk 原生快照 → 返回原生数据，但追加跨周继承保护
  if(own !== undefined && own._savedWk === k){
    return _resolveStatus(_mergeCarryItems(own, k, pid, weeks));
  }

  // 情况2：本周有数据，但可能被 _inherited 标记污染或 _savedWk 指向其他周
  // 检查是否有实质内容来判断是否为原生数据
  if(own !== undefined){
    // 如果有 _savedWk 但指向其他周（被错误覆盖），或者没有 _savedWk
    // 只要核心内容不为空，就视为该周的原生数据
    const hasRealContent =
      (typeof own.coreOutput==='string' && own.coreOutput.trim()) ||
      (Array.isArray(own.coreAction) && own.coreAction.some(i=>i&&i.text&&i.text.trim())) ||
      (typeof own.coreAction==='string' && own.coreAction.trim()) ||
      (Array.isArray(own.risk) && own.risk.some(i=>i&&i.text&&i.text.trim())) ||
      (Array.isArray(own.crossDept) && own.crossDept.some(i=>i&&i.text&&i.text.trim()));
    if(hasRealContent){
      // 修复 _savedWk 标记（如果被错误覆盖，重新修正为当前周）
      if(own._savedWk !== k){
        const weeksRef = LW();
        if(weeksRef[k] && weeksRef[k][pid]){
          weeksRef[k][pid] = {...own, _savedWk: k};
          SW(weeksRef);
        }
      }
      return _resolveStatus(_mergeCarryItems(own, k, pid, weeks));
    }
  }

  // 情况3：无该周原生快照 → 向前找最近可靠基础，提取顺延/延误项
  // 注：未来周也走此逻辑——没有原生数据就继承顺延/延误项，有原生数据就直接返回
  const sorted = Object.keys(weeks).filter(x => x < k).sort();
  let baseSnap = null;
  for(let i = sorted.length - 1; i >= 0; i--){
    const ws = weeks[sorted[i]];
    if(!ws || ws[pid] === undefined) continue;
    const c = ws[pid];
    if(c._inherited) continue; // 跳过继承视图，防止链式污染
    // 有 _savedWk 的优先，或者有实质内容的旧版
    const hasContent = (typeof c.coreOutput==='string' && c.coreOutput.trim()) ||
      (Array.isArray(c.coreAction) && c.coreAction.some(i=>i&&i.text&&i.text.trim())) ||
      (typeof c.coreAction==='string' && c.coreAction.trim());
    if(c._savedWk !== undefined || hasContent){
      baseSnap = {...c};
      break;
    }
  }

  if(!baseSnap) return blank;

  // 本周周一/周日
  const thisMonday = wkMonday(yr, wk);

  // 从基础快照的 coreAction 中提取顺延项和延误项
  const carryItems = _extractCarryItems(baseSnap.coreAction, thisMonday);

  // 继承视图：清空所有内容，只保留顺延/延误项
  return {
    status:     _resolveStatus({...baseSnap, risk:[], decision:[]}).status,
    stage:      baseSnap.stage !== undefined ? baseSnap.stage : defStage,
    coreOutput: '',
    coreAction: carryItems,
    risk:       [],
    decision:   [],
    crossDept:  [],
    knowledge:  '',
    incident:   '',
    next:       '',
    _inherited: true,
  };
}


function setSnap(yr,wk,pid,snap){
  const weeks=LW(), k=wkKey(yr,wk);
  if(!weeks[k]) weeks[k]={};
  // 写入 _savedWk 标识，让 getSnap 知道这是本周自己录入保存的原生快照
  // 清除运行时标记，防止继承视图被持久化
  const clean = {...snap, _savedWk: k};
  delete clean._inherited; delete clean._carryover; delete clean._overdue;
  weeks[k][pid] = clean;
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

// 活动日志
function _getActivity(){ try{ return JSON.parse(localStorage.getItem(_ACT_KEY)||'[]'); }catch{ return []; } }
function _addActivityLog(entry){
  const logs = _getActivity();
  logs.unshift(entry); if(logs.length>100) logs.length=100;
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
