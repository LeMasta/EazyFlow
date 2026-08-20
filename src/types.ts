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
}

export interface Project {
  id: string
  name: string
  description: string
  color: string
  status: ProjectStatus
  startAt: string
  dueAt?: string
  completedAt?: string
  predecessorId?: string
  lastOpenedAt?: string
  folderName?: string
  createdAt: string
  files: ProjectFile[]
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

export interface StoreSnapshot { projects: Project[]; settings: WorkSettings | null; storageRoot: string }

declare global {
  interface Window {
    eazyflow: {
      getSnapshot: () => Promise<StoreSnapshot>
      getAppVersion: () => Promise<string>
      createProject: (project: Omit<Project, 'id' | 'createdAt' | 'files'>) => Promise<Project>
      updateProject: (id: string, patch: Partial<Project>) => Promise<Project>
      deleteProject: (id: string) => Promise<void>
      touchProject: (id: string) => Promise<void>
      updateSettings: (settings: WorkSettings) => Promise<WorkSettings>
      importFiles: (projectId: string, category: FileCategory) => Promise<ProjectFile[]>
      importFolder: (projectId: string, category: FileCategory) => Promise<ProjectFile[]>
      importDroppedFiles: (projectId: string, category: FileCategory, files: File[]) => Promise<ProjectFile[]>
      importClipboardFiles: (projectId: string, category: FileCategory, files: File[]) => Promise<ProjectFile[]>
      filePreviewUrl: (projectId: string, fileId: string) => string
      openFile: (projectId: string, fileId: string) => Promise<void>
      revealFile: (projectId: string, fileId: string) => Promise<void>
      copyFile: (projectId: string, fileId: string) => Promise<string>
      deleteFile: (projectId: string, fileId: string) => Promise<void>
      selectStorageRoot: () => Promise<string | undefined>
      revealStorageRoot: () => Promise<void>
      checkForUpdates: () => Promise<void>
      installUpdate: () => Promise<void>
      onUpdateStatus: (callback: (status: string) => void) => () => void
    }
  }
}
