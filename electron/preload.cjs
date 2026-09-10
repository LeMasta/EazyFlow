const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('eazyflow', {
  getSnapshot: () => ipcRenderer.invoke('store:get'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  createProject: (project) => ipcRenderer.invoke('project:create', project),
  updateProject: (id, patch) => ipcRenderer.invoke('project:update', id, patch),
  updateGroup: (id, patch) => ipcRenderer.invoke('group:update', id, patch),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  touchProject: (id) => ipcRenderer.invoke('project:touch', id),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  importFiles: (projectId, category, destination) => ipcRenderer.invoke('file:import', projectId, category, destination),
  importFolder: (projectId, category, destination) => ipcRenderer.invoke('file:import-folder', projectId, category, destination),
  importDroppedFiles: (projectId, category, files, destination) => ipcRenderer.invoke('file:import-paths', projectId, category, files.map((file) => webUtils.getPathForFile(file)), destination),
  importClipboardFiles: async (projectId, category, files, destination) => ipcRenderer.invoke('file:import-clipboard', projectId, category, await Promise.all(files.map(async (file) => {
    const filePath = webUtils.getPathForFile(file)
    return filePath ? { path: filePath } : { name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) }
  })), destination),
  listFolder: (projectId, category, relativePath) => ipcRenderer.invoke('folder:list', projectId, category, relativePath),
  createFolder: (projectId, category, relativePath, name) => ipcRenderer.invoke('folder:create', projectId, category, relativePath, name),
  openFolderEntry: (projectId, category, relativePath) => ipcRenderer.invoke('folder:open', projectId, category, relativePath),
  revealFolderEntry: (projectId, category, relativePath) => ipcRenderer.invoke('folder:reveal', projectId, category, relativePath),
  copyFolderEntry: (projectId, category, relativePath) => ipcRenderer.invoke('folder:copy', projectId, category, relativePath),
  renameFolderEntry: (projectId, category, relativePath, name) => ipcRenderer.invoke('folder:rename', projectId, category, relativePath, name),
  deleteFolderEntry: (projectId, category, relativePath) => ipcRenderer.invoke('folder:delete', projectId, category, relativePath),
  filePreviewUrl: (projectId, fileId) => `eazyflow-file://${projectId}/${fileId}`,
  previewFile: (projectId, fileId) => ipcRenderer.invoke('file:preview', projectId, fileId),
  openFile: (projectId, fileId) => ipcRenderer.invoke('file:open', projectId, fileId),
  revealFile: (projectId, fileId) => ipcRenderer.invoke('file:reveal', projectId, fileId),
  copyFile: (projectId, fileId) => ipcRenderer.invoke('file:copy', projectId, fileId),
  renameFile: (projectId, fileId, name) => ipcRenderer.invoke('file:rename', projectId, fileId, name),
  deleteFile: (projectId, fileId) => ipcRenderer.invoke('file:delete', projectId, fileId),
  controlWindow: (action) => ipcRenderer.invoke('window:control', action),
  selectStorageRoot: () => ipcRenderer.invoke('storage:select'),
  revealStorageRoot: () => ipcRenderer.invoke('storage:reveal'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  }
})
