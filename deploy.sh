#!/bin/bash
# 一键部署到CloudBase并提交Git版本
# 用法：
#   ./deploy.sh "这次改了什么"          → 普通部署
#   ./deploy.sh "改了什么" --tag v25    → 部署并打稳定版Tag
#   ./deploy.sh "改了什么" --archive    → 部署+存档+打Tag（发布稳定版用）

MSG="${1:-deploy: 更新}"
TAG=""
ARCHIVE=false

# 解析参数
for arg in "$@"; do
  if [ "$PREV" = "--tag" ]; then TAG="$arg"; fi
  if [ "$arg" = "--archive" ]; then ARCHIVE=true; fi
  PREV="$arg"
done

echo "================================================"
echo "  华力集团研策部周报系统 - 部署脚本"
echo "================================================"
echo ""

# ── 1. 版本存档（仅 --archive 时执行）────────────────────────
if [ "$ARCHIVE" = true ]; then
  # 自动推算下一个版本号
  LAST=$(ls -d app_稳定版_* 2>/dev/null | sort | tail -1)
  if [ -z "$LAST" ]; then
    NEXT_VER="v1"
  else
    LAST_NUM=$(echo "$LAST" | grep -oE 'v[0-9]+' | grep -oE '[0-9]+' | tail -1)
    NEXT_VER="v$((LAST_NUM + 1))"
  fi
  DATE_STR=$(date +"%Y%m%d")
  ARCHIVE_DIR="app_稳定版_${NEXT_VER}_${DATE_STR}"

  echo "📁 存档当前版本 → $ARCHIVE_DIR ..."
  cp -r ./app "./$ARCHIVE_DIR"
  echo "  ✅ 存档完成"

  # 更新 VERSIONS.md
  echo "" >> VERSIONS.md
  echo "## ${NEXT_VER} - $(date +"%Y-%m-%d")" >> VERSIONS.md
  echo "- ${MSG}" >> VERSIONS.md
  echo "  ✅ VERSIONS.md 已更新"
  echo ""

  # 自动设置 tag 名
  if [ -z "$TAG" ]; then TAG="$NEXT_VER"; fi
fi

# ── 2. 提交代码到 Git ────────────────────────────────────────
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "📦 提交代码到 Git..."
  git add .
  git commit -m "$MSG"
  echo "  ✅ Git 提交完成"
else
  echo "  ℹ️  Git 无变更，跳过提交"
fi
echo ""

# ── 3. 上传到CloudBase静态托管 ───────────────────────────────
echo "☁️  上传文件到 CloudBase..."

echo "  → 生成 weekly_index.html（绝对路径版）并上传 → /weekly/index.html"
sed 's|href="css/|href="/app/css/|g' ./app/index.html \
  | sed 's|src="js/|src="/app/js/|g' > ./weekly_index.html
tcb hosting deploy ./weekly_index.html /weekly/index.html 2>&1 | grep -v "^$"

echo "  → 上传 portal.html → /index.html"
tcb hosting deploy ./portal.html /index.html 2>&1 | grep -v "^$"

echo "  → 上传 app/ → /app/"
tcb hosting deploy ./app /app 2>&1 | grep -E "✔|✖|file"

# KPI 模块（如果目录存在则上传）
if [ -d "./kpi" ]; then
  echo "  → 上传 kpi/ → /kpi/"
  tcb hosting deploy ./kpi /kpi 2>&1 | grep -E "✔|✖|file"
fi

echo ""

# ── 4. 打 Git Tag（稳定版标记）──────────────────────────────
if [ -n "$TAG" ]; then
  echo "🏷️  打版本标签 $TAG ..."
  git tag "$TAG" 2>/dev/null && echo "  ✅ Tag $TAG 已创建" \
    || echo "  ⚠️  Tag $TAG 已存在，跳过"
fi

# ── 5. 推送到 GitHub ─────────────────────────────────────────
echo "🚀 推送代码到 GitHub..."
git push 2>&1 || echo "  ⚠️  GitHub 推送失败（可能需要开代理），本地 Git 已保存"

# 推送 Tag（如有）
if [ -n "$TAG" ]; then
  git push origin "$TAG" 2>&1 \
    && echo "  ✅ Tag $TAG 已推送到 GitHub" \
    || echo "  ⚠️  Tag 推送失败，本地已保存"
fi

echo ""
echo "================================================"
echo "  ✅ 部署完成！"
if [ -n "$TAG" ]; then
  echo "  🏷️  版本标签：$TAG"
fi
echo "  🌐 访问：https://www.moodway.top"
echo "================================================"
