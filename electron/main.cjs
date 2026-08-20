const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol, net } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')

let mainWindow
const isDev = Boolean(process.env.EAZYFLOW_DEV_URL)
const categories = new Set(['task', 'reference', 'delivery', 'other'])
const categoryFolders = { task: '任务文件', reference: '参考文件', delivery: '交付文件', other: '其他' }
protocol.registerSchemesAsPrivileged([{ scheme: 'eazyflow-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

const seed = () => ({ projects: [], settings: null, storageRoot: null })
function paths() {
  const root = path.join(app.getPath('userData'), 'workspace')
  return { root, store: path.join(root, 'eazyflow.json'), files: path.join(root, 'projects') }
}
const exists = async (target) => fs.access(target).then(() => true).catch(() => false)
function safeName(value, fallback = '未命名项目') {
  let name = String(value || fallback).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 80) || fallback
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`
  return name
}
async function uniqueName(parent, desired, excludedPath) {
  const parsed = path.parse(safeName(desired, '未命名'))
  let candidate = `${parsed.name}${parsed.ext}`, index = 2
  while (await exists(path.join(parent, candidate)) && path.resolve(path.join(parent, candidate)) !== path.resolve(excludedPath || '')) candidate = `${parsed.name} (${index++})${parsed.ext}`
  return candidate
}
async function ensureProjectFolder(storageRoot, folderName) {
  const root = path.join(storageRoot, folderName)
  await fs.mkdir(root, { recursive: true })
}
function itemPath(store, project, file) {
  return path.join(store.storageRoot || paths().files, project.folderName, categoryFolders[file.category], file.storedName || file.name)
}
async function writeStore(data) {
  const p = paths(); await fs.mkdir(p.root, { recursive: true })
  const temp = `${p.store}.tmp`; await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8'); await fs.rename(temp, p.store)
}
async function readStore() {
  const p = paths(); await fs.mkdir(p.files, { recursive: true })
  let data
  try { data = JSON.parse(await fs.readFile(p.store, 'utf8')) }
  catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    data = seed()
  }
  data.projects ||= []; data.storageRoot ||= p.files
  await fs.mkdir(data.storageRoot, { recursive: true })
  if (data.settings) data.settings = {
    weekPreset: '双休', workDays: [1, 2, 3, 4, 5], bigWeekStartsThisWeek: true,
    publicHolidays: true, makeupWorkdays: true, irregularRest: false, restDates: [], dayOverrides: {}, recentProjectDays: 3, ...data.settings
  }
  let migrated = false
  const reservedFolders = new Set()
  for (const project of data.projects) {
    const completed = project.status === '已完成' || project.status === '已归档'
    const completedAt = completed ? (project.completedAt || project.dueAt || new Date().toISOString()) : undefined
    if (project.status === '已归档' || (completed && !project.completedAt)) migrated = true
    project.status = completed ? '已完成' : '进行中'; project.completedAt = completedAt
    if (!project.folderName) {
      const base = safeName(project.name); let folder = base, index = 2
      while (reservedFolders.has(folder) || await exists(path.join(data.storageRoot, folder))) folder = `${base} (${index++})`
      project.folderName = folder; migrated = true
    }
    reservedFolders.add(project.folderName)
    await ensureProjectFolder(data.storageRoot, project.folderName)
    project.files ||= []
    for (const file of project.files) {
      if (file.storedName) { file.kind ||= 'file'; continue }
      const categoryRoot = path.join(data.storageRoot, project.folderName, categoryFolders[file.category]), storedName = await uniqueName(categoryRoot, file.name)
      const legacyCandidates = [path.join(p.files, project.id, file.category, `${file.id}${file.extension || ''}`), path.join(data.storageRoot, project.id, file.category, `${file.id}${file.extension || ''}`)]
      let source
      for (const candidate of legacyCandidates) if (await exists(candidate)) { source = candidate; break }
      if (source) { await fs.mkdir(categoryRoot, { recursive: true }); await fs.copyFile(source, path.join(categoryRoot, storedName)); await fs.unlink(source) }
      file.storedName = storedName; file.kind = 'file'; migrated = true
    }
    for (const category of categories) await fs.rmdir(path.join(p.files, project.id, category)).catch(() => {})
    await fs.rmdir(path.join(p.files, project.id)).catch(() => {})
    for (const folder of Object.values(categoryFolders)) await fs.rmdir(path.join(data.storageRoot, project.folderName, folder)).catch(() => {})
  }
  if (migrated || !(await exists(p.store))) await writeStore(data)
  return data
}
async function findFile(projectId, fileId) {
  const store = await readStore(), project = store.projects.find((p) => p.id === projectId), file = project?.files.find((f) => f.id === fileId)
  if (!project || !file) throw new Error('文件或文件夹不存在')
  return { store, project, file, filePath: itemPath(store, project, file) }
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 920, minWidth: 1080, minHeight: 720, backgroundColor: '#f5f5f1', title: 'EazyFlow', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  mainWindow.setMenuBarVisibility(false)
  if (isDev) mainWindow.loadURL(process.env.EAZYFLOW_DEV_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  protocol.handle('eazyflow-file', async (request) => {
    const url = new URL(request.url), projectId = decodeURIComponent(url.hostname), fileId = decodeURIComponent(url.pathname.slice(1)), { file, filePath } = await findFile(projectId, fileId)
    if (file.kind === 'folder') return new Response('Folder previews are not supported', { status: 400 })
    return net.fetch(pathToFileURL(filePath).toString())
  })
  createWindow()
  if (!isDev) setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 3500)
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

ipcMain.handle('store:get', readStore)
ipcMain.handle('project:create', async (_event, input) => {
  const store = await readStore(), folderName = await uniqueName(store.storageRoot, input.name)
  const project = { ...input, id: crypto.randomUUID(), folderName, createdAt: new Date().toISOString(), files: [] }
  await ensureProjectFolder(store.storageRoot, folderName); store.projects.push(project); await writeStore(store); return project
})
ipcMain.handle('project:touch', async (_event, id) => {
  const store = await readStore(), project = store.projects.find((p) => p.id === id)
  if (!project) throw new Error('项目不存在')
  project.lastOpenedAt = new Date().toISOString(); await writeStore(store)
})
ipcMain.handle('project:update', async (_event, id, patch) => {
  const store = await readStore(), index = store.projects.findIndex((p) => p.id === id)
  if (index < 0) throw new Error('项目不存在')
  const project = store.projects[index], safe = { ...patch }; delete safe.id; delete safe.files; delete safe.createdAt; delete safe.folderName
  if (typeof safe.name === 'string' && safe.name.trim() && safe.name !== project.name) {
    const oldPath = path.join(store.storageRoot, project.folderName), nextFolder = await uniqueName(store.storageRoot, safe.name, oldPath)
    if (nextFolder !== project.folderName) await fs.rename(oldPath, path.join(store.storageRoot, nextFolder))
    project.folderName = nextFolder
  }
  store.projects[index] = { ...project, ...safe }; await writeStore(store); return store.projects[index]
})
ipcMain.handle('project:delete', async (_event, id) => {
  const store = await readStore(), project = store.projects.find((p) => p.id === id)
  if (!project) throw new Error('项目不存在')
  const folder = path.join(store.storageRoot, project.folderName)
  if (await exists(folder)) await shell.trashItem(folder)
  store.projects = store.projects.filter((p) => p.id !== id); await writeStore(store)
})
ipcMain.handle('settings:update', async (_event, settings) => {
  const values = ['startHour', 'endHour', 'breakStart', 'breakEnd'].map((key) => Number(settings[key]))
  if (values.some((value) => !Number.isFinite(value)) || values[0] < 0 || values[1] > 24 || values[0] >= values[1] || values[2] < values[0] || values[3] > values[1] || values[2] >= values[3]) throw new Error('工作时间设置无效')
  const store = await readStore(); store.settings = settings; await writeStore(store); return settings
})
async function importPaths(projectId, category, sourcePaths) {
  if (!categories.has(category)) throw new Error('无效文件分类')
  const store = await readStore(), project = store.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('项目不存在')
  const targetRoot = path.join(store.storageRoot, project.folderName, categoryFolders[category]); await fs.mkdir(targetRoot, { recursive: true })
  const imported = []
  for (const source of sourcePaths.filter(Boolean)) {
    const stat = await fs.stat(source), kind = stat.isDirectory() ? 'folder' : stat.isFile() ? 'file' : null
    if (!kind) continue
    const storedName = await uniqueName(targetRoot, path.basename(source)), extension = kind === 'file' ? path.extname(source) : ''
    const file = { id: crypto.randomUUID(), name: path.basename(source), storedName, kind, category, size: kind === 'file' ? stat.size : 0, extension, createdAt: new Date().toISOString() }
    const target = path.join(targetRoot, storedName)
    if (kind === 'folder') await fs.cp(source, target, { recursive: true, errorOnExist: true }); else await fs.copyFile(source, target)
    project.files.push(file); imported.push(file)
  }
  await writeStore(store); return imported
}
ipcMain.handle('file:import', async (_event, projectId, category) => {
  if (!categories.has(category)) throw new Error('无效文件分类')
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] })
  return result.canceled ? [] : importPaths(projectId, category, result.filePaths)
})
ipcMain.handle('file:import-folder', async (_event, projectId, category) => {
  if (!categories.has(category)) throw new Error('无效文件分类')
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  return result.canceled ? [] : importPaths(projectId, category, result.filePaths)
})
ipcMain.handle('file:import-paths', (_event, projectId, category, sourcePaths) => importPaths(projectId, category, sourcePaths))
ipcMain.handle('file:open', async (_event, projectId, fileId) => { const { filePath } = await findFile(projectId, fileId); const error = await shell.openPath(filePath); if (error) throw new Error(error) })
ipcMain.handle('file:reveal', async (_event, projectId, fileId) => { const { filePath } = await findFile(projectId, fileId); shell.showItemInFolder(filePath) })
ipcMain.handle('file:delete', async (_event, projectId, fileId) => {
  const { store, project, file, filePath } = await findFile(projectId, fileId)
  if (await exists(filePath)) await shell.trashItem(filePath)
  project.files = project.files.filter((f) => f.id !== fileId); await writeStore(store)
  const categoryRoot = path.join(store.storageRoot, project.folderName, categoryFolders[file.category])
  await fs.rmdir(categoryRoot).catch(() => {})
})
ipcMain.handle('storage:select', async () => {
  const store = await readStore(), result = await dialog.showOpenDialog(mainWindow, { title: '选择 EazyFlow 项目存储位置', defaultPath: store.storageRoot, properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled) return undefined
  const nextRoot = path.resolve(result.filePaths[0]), oldRoot = path.resolve(store.storageRoot)
  if (nextRoot === oldRoot) return store.storageRoot
  const relativeA = path.relative(oldRoot, nextRoot), relativeB = path.relative(nextRoot, oldRoot)
  if ((!relativeA.startsWith('..') && !path.isAbsolute(relativeA)) || (!relativeB.startsWith('..') && !path.isAbsolute(relativeB))) throw new Error('新旧存储位置不能互相包含，请选择另一个独立文件夹。')
  await fs.mkdir(nextRoot, { recursive: true })
  const oldFolders = []
  for (const project of store.projects) {
    const source = path.join(oldRoot, project.folderName), nextFolder = await uniqueName(nextRoot, project.folderName), target = path.join(nextRoot, nextFolder)
    if (await exists(source)) await fs.cp(source, target, { recursive: true, errorOnExist: true }); else await ensureProjectFolder(nextRoot, nextFolder)
    oldFolders.push(source); project.folderName = nextFolder
  }
  store.storageRoot = nextRoot; await writeStore(store)
  for (const oldFolder of oldFolders) if (await exists(oldFolder)) await shell.trashItem(oldFolder).catch(() => {})
  return nextRoot
})
ipcMain.handle('storage:reveal', async () => { const store = await readStore(); await fs.mkdir(store.storageRoot, { recursive: true }); const error = await shell.openPath(store.storageRoot); if (error) throw new Error(error) })

const sendUpdate = (status) => mainWindow?.webContents.send('updater:status', status)
autoUpdater.on('checking-for-update', () => sendUpdate('正在检查更新…'))
autoUpdater.on('update-available', (info) => sendUpdate(`发现新版本 ${info.version}，正在下载…`))
autoUpdater.on('update-not-available', () => sendUpdate('已经是最新版本'))
autoUpdater.on('download-progress', (p) => sendUpdate(`更新下载中 ${Math.round(p.percent)}%`))
autoUpdater.on('update-downloaded', () => sendUpdate('更新已下载，点击安装'))
autoUpdater.on('error', () => sendUpdate('暂时无法检查更新'))
ipcMain.handle('updater:check', () => isDev ? sendUpdate('开发模式不检查更新') : autoUpdater.checkForUpdates())
ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())
