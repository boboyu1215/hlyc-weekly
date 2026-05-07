/**
 * @ 提及推送服务
 * 扫描周报快照中的 @用户名，去重后推送到企微群（写入触发后端 wxwork.sendMention）
 * 调用时机：快照成功写入云端后（saveAndSync 末尾）
 */

interface ProjectLite {
  id: number;
  name: string;
}

interface MentionItem {
  toUser: string;
  finalText: string;
  dedupeKey: string;
}

export interface MentionPushResult {
  scanned: number;
  pushed: number;
}

/**
 * 推送某项目某周快照中的所有 @ 提及
 * @param project 项目对象（需要 id 和 name）
 * @param snapshot 周报快照（含 next/incident/knowledge/coreOutputItems/risk/coreAction/decision/crossDept）
 * @param currentUser 当前操作者
 */
export async function pushMentionsForProject(
  project: ProjectLite | null | undefined,
  snapshot: any,
  currentUser: string
): Promise<MentionPushResult> {
  if (!project || !snapshot) {
    return { scanned: 0, pushed: 0 };
  }

  const projectName = project.name || '';
  const allTexts: string[] = [
    snapshot.next || '',
    snapshot.incident || '',
    snapshot.knowledge || '',
    ...((snapshot.coreOutputItems || []) as any[]).map((i: any) => i.text || ''),
    ...((snapshot.risk || []) as any[]).map((i: any) => i.text || ''),
    ...((snapshot.coreAction || []) as any[]).map((i: any) => i.text || ''),
    ...((snapshot.decision || []) as any[]).map((i: any) => i.text || ''),
    ...((snapshot.crossDept || []) as any[]).map((i: any) => i.text || ''),
  ];

  // 第一步：扫描所有 @ 提及，前端预去重
  const pendingMentions: MentionItem[] = [];
  const seenKeys = new Set<string>();

  for (const text of allTexts) {
    if (!text) continue;
    let m;
    const re = /@([^\s，。！？,!?@]+)/g;
    while ((m = re.exec(text)) !== null) {
      const toUser = m[1];
      if (toUser.trim().length === 0) continue;

      const fullMatch = '@' + toUser;
      const atIdx = text.indexOf(fullMatch);
      let afterAt = text.slice(atIdx + fullMatch.length).trim();
      // 清理可能残留的正则/特殊字符串
      afterAt = afterAt.replace(/^\(\?=[^)]*\)\s*/g, '').replace(/@\S+\s*/g, '').trim();
      // 如果 @ 后无内容，则取整条文本（去掉 @用户名）
      if (!afterAt) afterAt = text.replace(fullMatch, '').trim();

      const mentionText = projectName ? `在「${projectName}」${afterAt}` : afterAt;
      const finalText = mentionText.length > 200 ? mentionText.slice(0, 200) + '…' : mentionText;
      const dedupeKey = toUser + '|' + afterAt.slice(0, 20);

      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        pendingMentions.push({ toUser, finalText, dedupeKey });
      }
    }
  }

  if (pendingMentions.length === 0) {
    console.log('[mention] 无 @ 提及，跳过');
    return { scanned: 0, pushed: 0 };
  }

  // 第二步：与服务端已推送过的对比，避免反复编辑同一文本反复推送
  let toPush: MentionItem[] = pendingMentions;
  try {
    const res = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'query', query: { prefix: 'mentions/' } })
    });
    const existingData = await res.json();
    if (Array.isArray(existingData)) {
      const existingKeys = new Set<string>();
      for (const doc of existingData) {
        const d = doc.data || doc;
        if (d && d.to && d.text) {
          const rawText = String(d.text).replace(/^在「[^\n]+?」/, '').trim();
          existingKeys.add(d.to + '|' + rawText.slice(0, 20));
        }
      }
      toPush = pendingMentions.filter(p => !existingKeys.has(p.dedupeKey));
    }
  } catch (e) {
    console.warn('[mention] 查询已有 mentions 失败，降级全量推送', e);
    // toPush 保持为 pendingMentions
  }

  // 第三步：逐条 set 写入服务端（后端 handleSet 中 mentions/* 路由会触发 wxwork.sendMention）
  for (const { toUser, finalText } of toPush) {
    fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set',
        id: 'mentions/' + Date.now() + '_' + toUser + '_' + Math.random().toString(36).slice(2, 6),
        data: {
          from: currentUser,
          to: toUser,
          text: finalText,
          source: 'weekly',
          createdAt: Date.now()
        }
      })
    }).catch(err => console.error('[mention] push failed', toUser, err));
  }

  console.log(
    `[mention] 去重结果: ${pendingMentions.length} 条中 ${toPush.length} 条需推送，` +
    `${pendingMentions.length - toPush.length} 条已存在`
  );
  return { scanned: pendingMentions.length, pushed: toPush.length };
}
