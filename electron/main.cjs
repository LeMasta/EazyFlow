const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

let mainWindow
const isDev = Boolean(process.env.EAZYFLOW_DEV_URL)
const categories = new Set(['task', 'reference', 'delivery', 'other'])

const now = new Date()
const localIso = (date, hour, minute = 0) => {
  const d = new Date(date); d.setHours(hour, minute, 0, 0); return d.toISOString()
}
const offset = (days) => { const d = new Date(now); d.setDate(d.getDate() + days); return d }
const seed = () => ({ projects: [
  { id: crypto.randomUUID(), name: '品牌视觉提案', description: '整理视觉方向并交付第一轮提案', color: '#7557d9', status: '进行中', startAt: localIso(offset(-1), 9), dueAt: localIso(offset(1), 18), createdAt: now.toISOString(), files: [] },
  { id: crypto.randomUUID(), name: '产品手册排版', description: '等待客户补充最终文案，交付时间暂未确定', color: '#e18b57', status: '进行中', startAt: localIso(offset(0), 13, 30), createdAt: now.toISOString(), files: [] },
  { id: crypto.randomUUID(), name: '季度复盘视频', description: '剪辑、字幕与封面输出', color: '#4c9b86', status: '未开始', startAt: localIso(offset(2), 10), dueAt: localIso(offset(5), 16), createdAt: now.toISOString(), files: [] }
] })

function paths() {
  const root = path.join(app.getPath('userData'), 'workspace')
  return { root, store: path.join(root, 'eazyflow.json'), files: path.join(root, 'projects') }
}
async function readStore() {
  const p = paths(); await fs.mkdir(p.files, { recursive: true })
  try { return JSON.parse(await fs.readFile(p.store, 'utf8')) }
  catch { const data = seed(); await writeStore(data); return data }
}
async function writeStore(data) {
  const p = paths(); await fs.mkdir(p.root, { recursive: true })
  const temp = `${p.store}.tmp`; await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8'); await fs.rename(temp, p.store)
}
async function findFile(projectId, fileId) {
  const store = await readStore(); const project = store.projects.find((p) => p.id === projectId)
  const file = project?.files.find((f) => f.id === fileId)
  if (!project || !file) throw new Error('文件不存在')
  return { store, project, file, filePath: path.join(paths().files, projectId, file.category, `${file.id}${file.extension}`) }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1080, minHeight: 720, backgroundColor: '#f5f5f1',
    title: 'EazyFlow', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  })
  if (isDev) mainWindow.loadURL(process.env.EAZYFLOW_DEV_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(async () => {
  createWindow()
  if (!isDev) setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 3500)
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

ipcMain.handle('store:get', readStore)
ipcMain.handle('project:create', async (_event, input) => {
  const store = await readStore(); const project = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), files: [] }
  store.projects.push(project); await writeStore(store); return project
})
ipcMain.handle('project:update', async (_event, id, patch) => {
  const store = await readStore(); const index = store.projects.findIndex((p) => p.id === id)
  if (index < 0) throw new Error('项目不存在')
  const safe = { ...patch }; delete safe.id; delete safe.files; delete safe.createdAt
  store.projects[index] = { ...store.projects[index], ...safe }; await writeStore(store); return store.projects[index]
})
ipcMain.handle('file:import', async (_event, projectId, category) => {
  if (!categories.has(category)) throw new Error('无效文件分类')
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] })
  if (result.canceled) return []
  const store = await readStore(); const project = store.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('项目不存在')
  const target = path.join(paths().files, projectId, category); await fs.mkdir(target, { recursive: true })
  const imported = []
  for (const source of result.filePaths) {
    const stat = await fs.stat(source); const extension = path.extname(source); const file = { id: crypto.randomUUID(), name: path.basename(source), category, size: stat.size, extension, createdAt: new Date().toISOString() }
    await fs.copyFile(source, path.join(target, `${file.id}${extension}`)); project.files.push(file); imported.push(file)
  }
  await writeStore(store); return imported
})
ipcMain.handle('file:open', async (_event, projectId, fileId) => { const { filePath } = await findFile(projectId, fileId); const error = await shell.openPath(filePath); if (error) throw new Error(error) })
ipcMain.handle('file:reveal', async (_event, projectId, fileId) => { const { filePath } = await findFile(projectId, fileId); shell.showItemInFolder(filePath) })
ipcMain.handle('file:delete', async (_event, projectId, fileId) => {
  const { store, project, filePath } = await findFile(projectId, fileId); await fs.rm(filePath, { force: true }); project.files = project.files.filter((f) => f.id !== fileId); await writeStore(store)
})

const sendUpdate = (status) => mainWindow?.webContents.send('updater:status', status)
autoUpdater.on('checking-for-update', () => sendUpdate('正在检查更新…'))
autoUpdater.on('update-available', (info) => sendUpdate(`发现新版本 ${info.version}，正在下载…`))
autoUpdater.on('update-not-available', () => sendUpdate('已经是最新版本'))
autoUpdater.on('download-progress', (p) => sendUpdate(`更新下载中 ${Math.round(p.percent)}%`))
autoUpdater.on('update-downloaded', () => sendUpdate('更新已下载，点击安装'))
autoUpdater.on('error', () => sendUpdate('暂时无法检查更新'))
ipcMain.handle('updater:check', () => isDev ? sendUpdate('开发模式不检查更新') : autoUpdater.checkForUpdates())
ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())
