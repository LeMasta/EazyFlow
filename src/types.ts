export type ProjectStatus = '进行中' | '已完成' | '已归档'
export type DisplayStatus = '未开始' | '进行中' | '已完成' | '已归档'
export type FileCategory = 'task' | 'reference' | 'delivery' | 'other'

export interface ProjectFile {
  id: string
  name: string
  category: FileCategory
  size: number
  extension: string
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
}

export interface StoreSnapshot { projects: Project[]; settings: WorkSettings | null }

declare global {
  interface Window {
    eazyflow: {
      getSnapshot: () => Promise<StoreSnapshot>
      createProject: (project: Omit<Project, 'id' | 'createdAt' | 'files'>) => Promise<Project>
      updateProject: (id: string, patch: Partial<Project>) => Promise<Project>
      deleteProject: (id: string) => Promise<void>
      updateSettings: (settings: WorkSettings) => Promise<WorkSettings>
      importFiles: (projectId: string, category: FileCategory) => Promise<ProjectFile[]>
      importDroppedFiles: (projectId: string, category: FileCategory, files: File[]) => Promise<ProjectFile[]>
      openFile: (projectId: string, fileId: string) => Promise<void>
      revealFile: (projectId: string, fileId: string) => Promise<void>
      deleteFile: (projectId: string, fileId: string) => Promise<void>
      checkForUpdates: () => Promise<void>
      installUpdate: () => Promise<void>
      onUpdateStatus: (callback: (status: string) => void) => () => void
    }
  }
}
