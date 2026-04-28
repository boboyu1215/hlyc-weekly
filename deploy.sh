#!/bin/bash
# ============================================================
#  HLYC 一键部署脚本
#  用法: bash ~/deploy-hlyc.sh
#  首次运行会引导配置，之后直接执行部署
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/.deploy.conf"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_err()   { echo -e "${RED}[ERR]${NC}   $1"; }
log_step()  { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ── 配置引导 ──
if [ ! -f "$CONFIG_FILE" ]; then
  log_warn "首次运行，需要配置服务器信息（只需配置一次）"
  echo ""
  
  read -p "服务器地址 [119.29.84.148]: " HOST
  HOST=${HOST:-119.29.84.148}
  
  read -p "SSH 端口 [22]: " PORT
  PORT=${PORT:-22}
  
  read -p "用户名 [ubuntu]: " USER
  USER=${USER:-ubuntu}
  
  read -sp "密码: " PASS
  echo ""
  
  read -p "本地项目路径 [$SCRIPT_DIR]: " LOCAL_PATH
  LOCAL_PATH=${LOCAL_PATH:-$SCRIPT_DIR}
  
  read -p "远程静态文件目录 [/var/www/weekly/]: " REMOTE_PATH
  REMOTE_PATH=${REMOTE_PATH:-/var/www/weekly/}
  
  cat > "$CONFIG_FILE" << CONF
HOST=$HOST
PORT=$PORT
USER=$USER
PASS=$PASS
LOCAL_PATH=$LOCAL_PATH
REMOTE_PATH=$REMOTE_PATH
CONF
  
  chmod 600 "$CONFIG_FILE"
  log_ok "配置已保存到 $CONFIG_FILE"
fi

# 加载配置
source "$CONFIG_FILE"

# ── 前置检查 ──
log_step "前置检查"

# 检查 sshpass
if ! command -v sshpass &> /dev/null; then
  log_err "需要 sshpass，正在安装..."
  if command -v brew &> /dev/null; then
    brew install hudochenkov/sshpass/sshpass
  else
    log_err "请手动安装 sshpass: brew install hudochenkov/sshpass/sshpass"
    exit 1
  fi
fi

# 检查本地路径
if [ ! -d "$LOCAL_PATH" ]; then
  log_err "本地项目路径不存在: $LOCAL_PATH"
  exit 1
fi

# 检查 SSH 连接
log_info "测试 SSH 连接 ${USER}@${HOST}..."
if ! sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -p "$PORT" "${USER}@${HOST}" "echo ok" &> /dev/null; then
  log_err "SSH 连接失败，请检查配置"
  log_info "重新配置: rm $CONFIG_FILE 后重新运行"
  exit 1
fi
log_ok "SSH 连接正常"

# ── 步骤 1: 本地构建 ──
log_step "步骤 1/3: 本地构建"

cd "$LOCAL_PATH"
log_info "项目路径: $(pwd)"
log_info "执行: npx vite build"

if npx vite build; then
  log_ok "构建成功"
else
  log_err "构建失败"
  exit 1
fi

# 检查构建产物
if [ ! -d "$LOCAL_PATH/dist" ]; then
  log_err "构建产物不存在: $LOCAL_PATH/dist"
  exit 1
fi

FILE_COUNT=$(find "$LOCAL_PATH/dist" -type f | wc -l)
log_ok "构建产物: $FILE_COUNT 个文件"

# ── 步骤 2: 备份服务器旧版本 ──
log_step "步骤 2/4: 备份服务器旧版本"

BACKUP_PARENT=$(dirname "$REMOTE_PATH")
BACKUP_NAME=$(basename "$REMOTE_PATH")
sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no -p "$PORT" "${USER}@${HOST}" \
  "rm -rf ${BACKUP_PARENT}/${BACKUP_NAME}.bak && cp -r ${REMOTE_PATH} ${BACKUP_PARENT}/${BACKUP_NAME}.bak"

log_ok "已备份到 ${REMOTE_PATH}.bak"

# ── 步骤 3: 清空旧文件（避免新旧版本混在一起） ──
log_step "步骤 3/4: 清空旧文件"

sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no -p "$PORT" "${USER}@${HOST}" \
  "rm -rf ${REMOTE_PATH}assets/* ${REMOTE_PATH}assets/.* 2>/dev/null; \
   rm -f ${REMOTE_PATH}index.html; \
   rm -f ${REMOTE_PATH}favicon.svg; \
   rm -rf ${REMOTE_PATH}public 2>/dev/null; \
   echo CLEARED"

log_ok "旧文件已清空"

# ── 步骤 4: 上传到服务器 ──
log_step "步骤 4/4: 上传构建产物"

log_info "上传 $LOCAL_PATH/dist/* → ${USER}@${HOST}:${REMOTE_PATH}"

sshpass -p "$PASS" scp -o StrictHostKeyChecking=no -r -P "$PORT" \
  "$LOCAL_PATH/dist/"* "${USER}@${HOST}:${REMOTE_PATH}"

log_ok "上传完成"

# ── 验证 ──
log_step "验证部署"

REMOTE_FILE_COUNT=$(sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no -p "$PORT" "${USER}@${HOST}" \
  "find ${REMOTE_PATH} -maxdepth 1 -type f | wc -l")

log_ok "服务器文件数: $REMOTE_FILE_COUNT"
log_info "访问地址: https://www.moodway.top/weekly/"

# ── 完成 ──
echo ""
log_ok "🎉 部署完成！$(date '+%Y-%m-%d %H:%M:%S')"
