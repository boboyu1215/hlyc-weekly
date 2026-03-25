#!/bin/bash
# 一键部署到CloudBase并提交Git版本
# 用法：./deploy.sh "这次改了什么"

MSG="${1:-deploy: 更新}"

echo "================================================"
echo "  华力集团研策部周报系统 - 部署脚本"
echo "================================================"
echo ""

# 1. 检查是否有未提交的修改
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "📦 提交代码到 Git..."
  git add .
  git commit -m "$MSG"
  echo "  ✅ Git 提交完成"
else
  echo "  ℹ️  Git 无变更，跳过提交"
fi

echo ""

# 2. 上传到CloudBase静态托管
echo "☁️  上传文件到 CloudBase..."

echo "  → 上传 index_fixed.html → /weekly/index.html"
tcb hosting deploy ./index_fixed.html /weekly/index.html 2>&1 | grep -v "^$"

echo "  → 上传 portal.html → /index.html"
tcb hosting deploy ./portal.html /index.html 2>&1 | grep -v "^$"

echo ""
echo "🚀 推送代码到 GitHub..."
git push 2>&1 || echo "  ⚠️  GitHub 推送失败（可能需要开代理），本地 Git 已保存"

echo ""
echo "================================================"
echo "  ✅ 部署完成！"
echo "  🌐 访问：https://www.moodway.top"
echo "================================================"
