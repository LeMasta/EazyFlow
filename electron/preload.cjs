const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('eazyflow', {
  getSnapshot: () => ipcRenderer.invoke('store:get'),
  createProject: (project) => ipcRenderer.invoke('project:create', project),
  updateProject: (id, patch) => ipcRenderer.invoke('project:update', id, patch),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  importFiles: (projectId, category) => ipcRenderer.invoke('file:import', projectId, category),
  openFile: (projectId, fileId) => ipcRenderer.invoke('file:open', projectId, fileId),
  revealFile: (projectId, fileId) => ipcRenderer.invoke('file:reveal', projectId, fileId),
  deleteFile: (projectId, fileId) => ipcRenderer.invoke('file:delete', projectId, fileId),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  }
})
