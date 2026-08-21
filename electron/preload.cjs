const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('eazyflow', {
  getSnapshot: () => ipcRenderer.invoke('store:get'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  createProject: (project) => ipcRenderer.invoke('project:create', project),
  updateProject: (id, patch) => ipcRenderer.invoke('project:update', id, patch),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  touchProject: (id) => ipcRenderer.invoke('project:touch', id),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  importFiles: (projectId, category) => ipcRenderer.invoke('file:import', projectId, category),
  importFolder: (projectId, category) => ipcRenderer.invoke('file:import-folder', projectId, category),
  importDroppedFiles: (projectId, category, files) => ipcRenderer.invoke('file:import-paths', projectId, category, files.map((file) => webUtils.getPathForFile(file))),
  importClipboardFiles: async (projectId, category, files) => ipcRenderer.invoke('file:import-clipboard', projectId, category, await Promise.all(files.map(async (file) => {
    const filePath = webUtils.getPathForFile(file)
    return filePath ? { path: filePath } : { name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) }
  }))),
  filePreviewUrl: (projectId, fileId) => `eazyflow-file://${projectId}/${fileId}`,
  openFile: (projectId, fileId) => ipcRenderer.invoke('file:open', projectId, fileId),
  revealFile: (projectId, fileId) => ipcRenderer.invoke('file:reveal', projectId, fileId),
  copyFile: (projectId, fileId) => ipcRenderer.invoke('file:copy', projectId, fileId),
  renameFile: (projectId, fileId, name) => ipcRenderer.invoke('file:rename', projectId, fileId, name),
  deleteFile: (projectId, fileId) => ipcRenderer.invoke('file:delete', projectId, fileId),
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
