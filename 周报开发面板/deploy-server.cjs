const express = require('express')
const { exec, spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const app = express()
const PORT = 3006

// 面板位于项目根目录下的"周报开发面板/"文件夹，项目根目录是上一级
const PROJECTS_DIR = path.resolve(__dirname, '..')

// 多项目配置
const PROJECTS = {
  weekly: {
    name: '华力周报系统',
    dir: PROJECTS_DIR,
    serverIp: '119.29.84.148',
    serverUser: 'ubuntu',
    serverPass: 'Zhangbo770979',
    serverPath: '/var/www/weekly',
    buildCmd: 'npx vite build',
    previewPort: 3003,
    previewUrl: 'http://localhost:3003/weekly/',
    pm2Name: 'weekly-api'
  },
  taoyue: {
    name: '桃悦OS',
    dir: '/Users/cheungbo/Documents/taoyue-os',
    serverIp: '119.29.84.148',
    serverUser: 'ubuntu',
    serverPass: 'Zhangbo770979',
    serverPath: '/var/www/taoyue-os',
    buildCmd: 'npm run build',
    previewPort: 3001,
    previewUrl: 'http://localhost:3001',
    pm2Name: 'taoyue-os'
  }
}

app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, 'deploy-public')))
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// SSE日志
const clients = []
app.get('/log-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  clients.push(res)
  req.on('close', () => {
    const i = clients.indexOf(res)
    if (i > -1) clients.splice(i, 1)
  })
})

function pushLog(msg, type = 'info') {
  if (!msg?.trim()) return
  const data = JSON.stringify({ msg: msg.trim(), type, time: new Date().toLocaleTimeString('zh-CN') })
  clients.forEach(c => c.write(`data: ${data}\n\n`))
}

function runCommand(cmd, cwd) {
  return new Promise((resolve, reject) => {
    pushLog(`$ ${cmd}`)
    const proc = spawn('bash', ['-c', cmd], { cwd })
    proc.stdout.on('data', d => pushLog(d.toString().trim()))
    proc.stderr.on('data', d => pushLog(d.toString().trim(), 'warn'))
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`退出码: ${code}`))
    })
  })
}

function getProject(req) {
  const id = req.query.project || req.body?.project || 'weekly'
  return { id, ...PROJECTS[id] }
}

// 项目列表
app.get('/projects', (req, res) => {
  res.json(Object.entries(PROJECTS).map(([id, p]) => ({ id, name: p.name, previewUrl: p.previewUrl })))
})

// Git状态
app.get('/status', (req, res) => {
  const proj = getProject(req)
  if (!fs.existsSync(proj.dir)) return res.json({ commits: [], current: 'N/A', changes: [] })
  exec('git log --oneline -5', { cwd: proj.dir }, (e, stdout) => {
    exec('git rev-parse --short HEAD', { cwd: proj.dir }, (e2, hash) => {
      exec('git status --short', { cwd: proj.dir }, (e3, status) => {
        res.json({
          commits: (stdout || '').trim().split('\n').filter(Boolean),
          current: (hash || 'N/A').trim(),
          changes: (status || '').trim().split('\n').filter(Boolean)
        })
      })
    })
  })
})

// 服务器进程状态
app.get('/server-status', (req, res) => {
  const proj = getProject(req)
  exec(`sshpass -p '${proj.serverPass}' ssh -o StrictHostKeyChecking=no ${proj.serverUser}@${proj.serverIp} "pm2 jlist 2>/dev/null"`, (e, stdout) => {
    try {
      const list = JSON.parse(stdout || '[]')
      const proc = list.find(p => p.name === proj.pm2Name)
      res.json({
        online: proc?.pm2_env?.status === 'online',
        cpu: proc?.monit?.cpu ?? 0,
        memory: proc ? Math.round(proc.monit.memory / 1024 / 1024) : 0,
        uptime: proc?.pm2_env?.pm_uptime
      })
    } catch {
      res.json({ online: false, cpu: 0, memory: 0 })
    }
  })
})

// 文件树
app.get('/files', (req, res) => {
  const proj = getProject(req)
  const srcDir = path.join(proj.dir, 'src')
  if (!fs.existsSync(srcDir)) return res.json([])

  function walk(dir, base = '') {
    const items = []
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const rel = base ? `${base}/${e.name}` : e.name
        if (e.isDirectory()) {
          const children = walk(path.join(dir, e.name), rel)
          if (children.length > 0) items.push({ type: 'dir', name: e.name, path: rel, children })
        } else if (/\.(vue|ts|js|css|json)$/.test(e.name)) {
          items.push({ type: 'file', name: e.name, path: rel })
        }
      }
    } catch {}
    return items
  }
  res.json(walk(srcDir))
})

// 读文件
app.get('/file', (req, res) => {
  const proj = getProject(req)
  const fullPath = path.join(proj.dir, 'src', req.query.path)
  if (!fullPath.startsWith(path.join(proj.dir, 'src'))) return res.status(403).json({ error: '禁止访问' })
  try {
    res.json({ content: fs.readFileSync(fullPath, 'utf-8') })
  } catch {
    res.status(404).json({ error: '文件不存在' })
  }
})

// 保存文件（含TypeScript校验+多版本备份）
app.post('/file', (req, res) => {
  const proj = getProject(req)
  const { path: filePath, content } = req.body
  const fullPath = path.join(proj.dir, 'src', filePath)
  if (!fullPath.startsWith(path.join(proj.dir, 'src'))) return res.status(403).json({ error: '禁止访问' })

  // TypeScript校验
  if (/\.(ts|vue)$/.test(filePath)) {
    const tmpPath = fullPath + '.tmp'
    try {
      fs.writeFileSync(tmpPath, content, 'utf-8')
      execSync(`cd ${proj.dir} && npx vue-tsc --noEmit 2>&1`, { timeout: 30000, stdio: 'pipe' })
      fs.unlinkSync(tmpPath)
    } catch (e) {
      if (fs.existsSync(fullPath + '.tmp')) fs.unlinkSync(fullPath + '.tmp')
      const detail = (e.stdout || e.stderr || e.message || '').toString().slice(0, 2000)
      return res.status(400).json({ error: '语法错误，保存已阻止', detail })
    }
  }

  // 多版本备份（保留5个）
  const bakDir = path.join(proj.dir, '.deploy-backups', filePath.replace(/\//g, '_'))
  fs.mkdirSync(bakDir, { recursive: true })
  if (fs.existsSync(fullPath)) {
    const ts = Date.now()
    fs.copyFileSync(fullPath, path.join(bakDir, `${ts}.bak`))
    // 只保留最近5个
    const baks = fs.readdirSync(bakDir).sort()
    while (baks.length > 5) {
      fs.unlinkSync(path.join(bakDir, baks.shift()))
    }
  }

  fs.writeFileSync(fullPath, content, 'utf-8')
  pushLog(`✅ 已保存: src/${filePath}`, 'success')
  res.json({ ok: true })
})

// 获取备份列表
app.get('/backups', (req, res) => {
  const proj = getProject(req)
  const filePath = req.query.path
  const bakDir = path.join(proj.dir, '.deploy-backups', filePath.replace(/\//g, '_'))
  if (!fs.existsSync(bakDir)) return res.json([])
  const baks = fs.readdirSync(bakDir).sort().reverse().map(f => ({
    ts: parseInt(f),
    time: new Date(parseInt(f)).toLocaleString('zh-CN'),
    file: f
  }))
  res.json(baks)
})

// 恢复备份
app.post('/restore', (req, res) => {
  const proj = getProject(req)
  const { path: filePath, bakFile } = req.body
  const fullPath = path.join(proj.dir, 'src', filePath)
  const bakDir = path.join(proj.dir, '.deploy-backups', filePath.replace(/\//g, '_'))
  const bakPath = bakFile ? path.join(bakDir, bakFile) : path.join(bakDir, fs.readdirSync(bakDir).sort().pop())
  if (!fs.existsSync(bakPath)) return res.status(404).json({ error: '备份不存在' })
  fs.copyFileSync(bakPath, fullPath)
  pushLog(`⏪ 已恢复备份: src/${filePath}`, 'success')
  res.json({ ok: true, content: fs.readFileSync(fullPath, 'utf-8') })
})

// Diff对比
app.post('/diff', (req, res) => {
  const proj = getProject(req)
  const { path: filePath, newContent } = req.body
  const fullPath = path.join(proj.dir, 'src', filePath)
  const original = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : ''
  res.json({ original, newContent })
})

// 本地预览
const devProcesses = {}
app.post('/preview/start', (req, res) => {
  const proj = getProject(req)
  if (devProcesses[proj.id]) return res.json({ ok: true, msg: '已在运行' })
  const proc = spawn('npm', ['run', 'dev'], { cwd: proj.dir })
  proc.stdout.on('data', d => pushLog(d.toString().trim()))
  proc.stderr.on('data', d => pushLog(d.toString().trim(), 'warn'))
  proc.on('close', () => { delete devProcesses[proj.id] })
  devProcesses[proj.id] = proc
  pushLog(`🚀 预览已启动: ${proj.previewUrl}`, 'success')
  res.json({ ok: true })
})

app.post('/preview/stop', (req, res) => {
  const proj = getProject(req)
  if (devProcesses[proj.id]) {
    devProcesses[proj.id].kill()
    delete devProcesses[proj.id]
    pushLog('⏹️ 预览已停止')
  }
  res.json({ ok: true })
})

app.get('/preview/status', (req, res) => {
  const proj = getProject(req)
  res.json({ running: !!devProcesses[proj.id] })
})

// 构建
app.post('/build', async (req, res) => {
  const proj = getProject(req)
  res.json({ ok: true })
  try {
    pushLog('🔨 构建中...', 'info')
    await runCommand(proj.buildCmd, proj.dir)
    pushLog('✅ 构建完成', 'success')
  } catch (e) {
    pushLog(`❌ 构建失败: ${e.message}`, 'error')
  }
})

// 部署
app.post('/deploy', async (req, res) => {
  const proj = getProject(req)
  res.json({ ok: true })
  try {
    pushLog(`🚀 部署 ${proj.name}...`, 'info')
    await runCommand(proj.buildCmd, proj.dir)
    pushLog('✅ 构建完成', 'success')
    await runCommand(`sshpass -p '${proj.serverPass}' ssh -o StrictHostKeyChecking=no ${proj.serverUser}@${proj.serverIp} "rm -rf ${proj.serverPath}/assets/*"`)
    await runCommand(`sshpass -p '${proj.serverPass}' scp -r dist/* ${proj.serverUser}@${proj.serverIp}:${proj.serverPath}/`)
    pushLog('✅ 部署完成！', 'success')
    const msg = req.body?.message || `deploy: ${new Date().toLocaleString('zh-CN')}`
    await runCommand(`cd ${proj.dir} && git add -A && git commit -m "${msg}" || true`)
    await runCommand(`cd ${proj.dir} && git push origin main || true`)
    pushLog('📦 已推送GitHub', 'success')
  } catch (e) {
    pushLog(`❌ 部署失败: ${e.message}`, 'error')
  }
})

// 回滚
app.post('/rollback', async (req, res) => {
  const proj = getProject(req)
  res.json({ ok: true })
  try {
    pushLog('⏪ 回滚中...', 'info')
    await runCommand(`cd ${proj.dir} && git checkout HEAD~1`)
    await runCommand(proj.buildCmd, proj.dir)
    await runCommand(`sshpass -p '${proj.serverPass}' ssh -o StrictHostKeyChecking=no ${proj.serverUser}@${proj.serverIp} "rm -rf ${proj.serverPath}/assets/*"`)
    await runCommand(`sshpass -p '${proj.serverPass}' scp -r dist/* ${proj.serverUser}@${proj.serverIp}:${proj.serverPath}/`)
    pushLog('✅ 回滚完成', 'success')
  } catch (e) {
    pushLog(`❌ 回滚失败: ${e.message}`, 'error')
  }
})

app.listen(PORT, () => {
  console.log(`✅ 开发面板: http://localhost:${PORT}`)
})
