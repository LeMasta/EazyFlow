export type ProjectStatus = '进行中' | '已完成'
export type DisplayStatus = '未开始' | '进行中' | '已完成'
export type FileCategory = 'task' | 'reference' | 'delivery' | 'other'
export type DayOverride = 'leave' | 'timeoff' | 'overtime'

export interface ProjectFile {
  id: string
  name: string
  category: FileCategory
  kind?: 'file' | 'folder'
  size: number
  extension: string
  storedName?: string
  createdAt: string
  relativePath?: string
}

export interface Project {
  id: string
  name: string
  description: string
  supportTarget?: string
  color: string
  status: ProjectStatus
  startAt: string
  dueAt?: string
  completedAt?: string
  groupId?: string
  lastOpenedAt?: string
  folderName?: string
  createdAt: string
  files: ProjectFile[]
}

export interface ProjectGroup {
  id: string
  name: string
  description: string
  color: string
  createdAt: string
}

export interface WorkSettings {
  startHour: number
  endHour: number
  breakStart: number
  breakEnd: number
  weekPreset: '双休' | '单休' | '大小周' | '自定义'
  workDays: number[]
  bigWeekStartsThisWeek: boolean
  publicHolidays: boolean
  makeupWorkdays: boolean
  irregularRest: boolean
  restDates: string[]
  dayOverrides: Record<string, DayOverride>
  recentProjectDays: number
}

export interface StoreSnapshot { projects: Project[]; groups: ProjectGroup[]; settings: WorkSettings | null; storageRoot: string }

declare global {
  interface Window {
    eazyflow: {
      getSnapshot: () => Promise<StoreSnapshot>
      getAppVersion: () => Promise<string>
      createProject: (project: Omit<Project, 'id' | 'createdAt' | 'files'> & { relatedProjectId?: string; targetGroupId?: string; groupName?: string; groupColor?: string }) => Promise<Project>
      updateProject: (id: string, patch: Partial<Project> & { relatedProjectId?: string; targetGroupId?: string; groupName?: string; groupColor?: string; clearGroup?: boolean }) => Promise<Project>
      updateGroup: (id: string, patch: Partial<ProjectGroup>) => Promise<ProjectGroup>
      deleteProject: (id: string) => Promise<void>
      touchProject: (id: string) => Promise<void>
      updateSettings: (settings: WorkSettings) => Promise<WorkSettings>
      importFiles: (projectId: string, category: FileCategory, destination?: string) => Promise<ProjectFile[]>
      importFolder: (projectId: string, category: FileCategory, destination?: string) => Promise<ProjectFile[]>
      importDroppedFiles: (projectId: string, category: FileCategory, files: File[], destination?: string) => Promise<ProjectFile[]>
      importClipboardFiles: (projectId: string, category: FileCategory, files: File[], destination?: string) => Promise<ProjectFile[]>
      listFolder: (projectId: string, category: FileCategory, relativePath?: string) => Promise<ProjectFile[]>
      createFolder: (projectId: string, category: FileCategory, relativePath: string, name: string) => Promise<void>
      openFolderEntry: (projectId: string, category: FileCategory, relativePath: string) => Promise<void>
      revealFolderEntry: (projectId: string, category: FileCategory, relativePath: string) => Promise<void>
      copyFolderEntry: (projectId: string, category: FileCategory, relativePath: string) => Promise<string>
      renameFolderEntry: (projectId: string, category: FileCategory, relativePath: string, name: string) => Promise<void>
      deleteFolderEntry: (projectId: string, category: FileCategory, relativePath: string) => Promise<void>
      filePreviewUrl: (projectId: string, fileId: string) => string
      previewFile: (projectId: string, fileId: string) => Promise<void>
      openFile: (projectId: string, fileId: string) => Promise<void>
      revealFile: (projectId: string, fileId: string) => Promise<void>
      copyFile: (projectId: string, fileId: string) => Promise<string>
      renameFile: (projectId: string, fileId: string, name: string) => Promise<ProjectFile>
      deleteFile: (projectId: string, fileId: string) => Promise<void>
      controlWindow: (action: 'minimize' | 'maximize' | 'close') => Promise<void>
      selectStorageRoot: () => Promise<string | undefined>
      revealStorageRoot: () => Promise<void>
      checkForUpdates: () => Promise<void>
      installUpdate: () => Promise<void>
      onUpdateStatus: (callback: (status: string) => void) => () => void
    }
  }
}
