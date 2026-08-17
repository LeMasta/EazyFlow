const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol, net } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')

let mainWindow
const isDev = Boolean(process.env.EAZYFLOW_DEV_URL)
const categories = new Set(['task', 'reference', 'delivery', 'other'])
protocol.registerSchemesAsPrivileged([{ scheme: 'eazyflow-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

const seed = () => ({ projects: [], settings: null })

function paths() {
  const root = path.join(app.getPath('userData'), 'workspace')
  return { root, store: path.join(root, 'eazyflow.json'), files: path.join(root, 'projects') }
}
async function readStore() {
  const p = paths(); await fs.mkdir(p.files, { recursive: true })
  try {
    const data = JSON.parse(await fs.readFile(p.store, 'utf8'))
    if (data.settings) data.settings = {
      weekPreset: '双休', workDays: [1, 2, 3, 4, 5], bigWeekStartsThisWeek: true,
      publicHolidays: true, makeupWorkdays: true, irregularRest: false, restDates: [], dayOverrides: {},
      ...data.settings
    }
    let migrated = false
    data.projects = (data.projects || []).map((project) => {
      const completed = project.status === '已完成' || project.status === '已归档'
      const completedAt = completed ? (project.completedAt || project.dueAt || new Date().toISOString()) : undefined
      if (project.status === '已归档' || (completed && !project.completedAt)) migrated = true
      return { ...project, status: completed ? '已完成' : '进行中', completedAt }
    })
    if (migrated) await writeStore(data)
    return data
  }
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
    title: 'EazyFlow', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  })
  mainWindow.setMenuBarVisibility(false)
  if (isDev) mainWindow.loadURL(process.env.EAZYFLOW_DEV_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  protocol.handle('eazyflow-file', async (request) => {
    const url = new URL(request.url)
    const projectId = decodeURIComponent(url.hostname)
    const fileId = decodeURIComponent(url.pathname.slice(1))
    const { filePath } = await findFile(projectId, fileId)
    return net.fetch(pathToFileURL(filePath).toString())
  })
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
ipcMain.handle('project:delete', async (_event, id) => {
  const store = await readStore(); const project = store.projects.find((p) => p.id === id)
  if (!project) throw new Error('项目不存在')
  const folder = path.join(paths().files, id)
  try { await fs.access(folder); await shell.trashItem(folder) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  store.projects = store.projects.filter((p) => p.id !== id); await writeStore(store)
})
ipcMain.handle('settings:update', async (_event, settings) => {
  const values = ['startHour', 'endHour', 'breakStart', 'breakEnd'].map((key) => Number(settings[key]))
  if (values.some((value) => !Number.isFinite(value)) || values[0] < 0 || values[1] > 24 || values[0] >= values[1] || values[2] < values[0] || values[3] > values[1] || values[2] >= values[3]) throw new Error('工作时间设置无效')
  const store = await readStore(); store.settings = settings; await writeStore(store); return settings
})
async function importPaths(projectId, category, filePaths) {
  if (!categories.has(category)) throw new Error('无效文件分类')
  const store = await readStore(); const project = store.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('项目不存在')
  const target = path.join(paths().files, projectId, category); await fs.mkdir(target, { recursive: true })
  const imported = []
  for (const source of filePaths) {
    const stat = await fs.stat(source)
    if (!stat.isFile()) continue
    const extension = path.extname(source); const file = { id: crypto.randomUUID(), name: path.basename(source), category, size: stat.size, extension, createdAt: new Date().toISOString() }
    await fs.copyFile(source, path.join(target, `${file.id}${extension}`)); project.files.push(file); imported.push(file)
  }
  await writeStore(store); return imported
}
ipcMain.handle('file:import', async (_event, projectId, category) => {
  if (!categories.has(category)) throw new Error('无效文件分类')
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] })
  if (result.canceled) return []
  return importPaths(projectId, category, result.filePaths)
})
ipcMain.handle('file:import-paths', (_event, projectId, category, filePaths) => importPaths(projectId, category, filePaths))
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
