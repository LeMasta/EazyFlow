import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addDays, addMonths, differenceInCalendarWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isWithinInterval, parseISO, startOfDay, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Copy, Edit3, ExternalLink, File as FileIcon, FileCheck2, FileInput, FolderOpen, FolderPlus, Layers, LayoutGrid, Library, Link2, MoreHorizontal, Palette, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Search, Settings2, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react'
import { getFestival, isAdditionalWorkday } from 'chinese-workday'
import type { DayOverride, DisplayStatus, FileCategory, GlobalSearchFileResult, Project, ProjectFile, ProjectGroup, ProjectStatus, SupportTarget, WorkSettings } from './types'
import appIcon from '../build/icon.svg'

const categories: { id: FileCategory; label: string; hint: string; icon: typeof FileIcon }[] = [
  { id: 'task', label: '任务文件', hint: '需求、原始素材与任务说明', icon: FileInput },
  { id: 'reference', label: '参考文件', hint: '灵感、范例与背景资料', icon: FolderOpen },
  { id: 'delivery', label: '交付文件', hint: '最终版本与交付记录', icon: FileCheck2 },
  { id: 'other', label: '其他', hint: '过程稿和暂未归类的内容', icon: FileIcon }
]
const colors = ['#7557d9','#9b59b6','#5c6ac4','#477fbd','#3b9fd4','#36a9a1','#4c9b86','#66a84f','#94a83d','#b38a36','#d4a72c','#e18b57','#df704d','#d45f70','#c94f8a','#8d6e63','#657079','#343a40']
const randomColor=(used:string[])=>{
  const occupied=new Set(used.map(value=>value.toLowerCase()))
  for(let attempt=0;attempt<50;attempt++){
    const hue=Math.floor(Math.random()*360),saturation=52+Math.floor(Math.random()*18),lightness=45+Math.floor(Math.random()*14)
    const a=saturation*Math.min(lightness,100-lightness)/10000,channel=(n:number)=>{const k=(n+hue/30)%12;return lightness/100-a*Math.max(-1,Math.min(k-3,9-k,1))},hex=(value:number)=>Math.round(255*value).toString(16).padStart(2,'0')
    const candidate=`#${hex(channel(0))}${hex(channel(8))}${hex(channel(4))}`
    if(!occupied.has(candidate))return candidate
  }
  return `#${Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')}`
}
const dateKey = (d: Date) => format(d, 'yyyy-MM-dd')
const toLocalInput = (iso?: string) => iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : ''
const bytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
const deliveryVariance=(p:Project)=>{
  if(!p.dueAt||!p.completedAt)return null
  const minutes=Math.round((parseISO(p.completedAt).getTime()-parseISO(p.dueAt).getTime())/60000)
  if(Math.abs(minutes)<1)return '按计划完成'
  const absolute=Math.abs(minutes),text=absolute>=1440?`${Math.floor(absolute/1440)}天${Math.floor(absolute%1440/60)}小时`:absolute>=60?`${Math.floor(absolute/60)}小时${absolute%60}分钟`:`${absolute}分钟`
  return minutes<0?`提前 ${text}`:`逾期 ${text}`
}
const effectiveStatus = (p: Project, now=new Date()): DisplayStatus => p.status === '已完成' ? '已完成' : now < parseISO(p.startAt) ? '未开始' : '进行中'
const isOverdue=(p:Project,now=new Date())=>p.status!=='已完成'&&Boolean(p.dueAt)&&now>parseISO(p.dueAt!)
const projectCreatedTimestamp=(p:Project)=>{const timestamp=Date.parse(p.createdAt);return Number.isFinite(timestamp)?timestamp:0}
const hourText = (n:number) => {
  const hour=Math.floor(n),minute=Math.round((n-hour)*60)
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
}
const themePresets = [
  { id: 'violet', name: '雾紫', colors: { accent: '#6652c8', page: '#f7f6fa', surface: '#ffffff', sidebar: '#24232c', tag: '#f2effa' } },
  { id: 'sage', name: '青杉', colors: { accent: '#4f806d', page: '#f4f8f5', surface: '#ffffff', sidebar: '#202a27', tag: '#eaf3ee' } },
  { id: 'ocean', name: '远海', colors: { accent: '#3976a8', page: '#f3f7fb', surface: '#ffffff', sidebar: '#202936', tag: '#eaf2f9' } },
  { id: 'amber', name: '暖砂', colors: { accent: '#a86b3d', page: '#faf6f0', surface: '#ffffff', sidebar: '#2a2522', tag: '#f7eee5' } }
] as const
const appearanceFields = [
  { id: 'accent', label: '品牌强调色' },
  { id: 'page', label: '工作区底色' },
  { id: 'surface', label: '内容表面色' },
  { id: 'sidebar', label: '侧栏底色' },
  { id: 'tag', label: '标签与轻强调色' }
] as const
const defaultSchedule:WorkSettings={startHour:9,endHour:18,breakStart:12,breakEnd:13,weekPreset:'双休',workDays:[1,2,3,4,5],bigWeekStartsThisWeek:true,publicHolidays:true,makeupWorkdays:true,irregularRest:false,restDates:[],dayOverrides:{},recentProjectDays:3,receivePrereleases:false,sidebarCollapsed:false,appearancePreset:'violet',customAppearanceEnabled:false,customAppearance:{accent:'#6652c8',page:'#f7f6fa',surface:'#ffffff',sidebar:'#24232c',tag:'#f2effa'}}
const projectEnd=(p:Project,now=new Date())=>p.completedAt?parseISO(p.completedAt):p.dueAt&&parseISO(p.dueAt)>now?parseISO(p.dueAt):now
const isWorkingDate=(date:Date,s:WorkSettings)=>{
  const key=dateKey(date)
  const override=s.dayOverrides?.[key]
  if(override==='overtime')return true
  if(override==='leave'||override==='timeoff')return false
  if(s.irregularRest&&s.restDates.includes(key))return false
  if(s.publicHolidays){
    if(s.makeupWorkdays&&isAdditionalWorkday(key))return true
    const festival=getFestival(key)
    if(festival&&festival!=='周末'&&festival!=='工作日')return false
  }
  if(s.weekPreset==='大小周'){
    const delta=Math.abs(differenceInCalendarWeeks(date,new Date(),{weekStartsOn:1}))
    const big=delta%2===0?s.bigWeekStartsThisWeek:!s.bigWeekStartsThisWeek
    return [1,2,3,4,5].includes(date.getDay())||(big&&date.getDay()===6)
  }
  return s.workDays.includes(date.getDay())
}

function App() {
  const [projects,setProjects]=useState<Project[]>([])
  const [groups,setGroups]=useState<ProjectGroup[]>([])
  const [supportTargets,setSupportTargets]=useState<SupportTarget[]>([])
  const [settings,setSettings]=useState<WorkSettings|null|undefined>()
  const [storageRoot,setStorageRoot]=useState('')
  const [appVersion,setAppVersion]=useState('')
  const [page,setPage]=useState<'timeline'|'library'|'settings'>('timeline')
  const [view,setView]=useState<'hour'|'month'>('hour')
  const [cursor,setCursor]=useState(new Date())
  const [activeId,setActiveId]=useState<string|null>(null)
  const [activeGroupId,setActiveGroupId]=useState<string|null>(null)
  const [creating,setCreating]=useState(false)
  const [scheduleOpen,setScheduleOpen]=useState(false)
  const [search,setSearch]=useState('')
  const [searchOpen,setSearchOpen]=useState(false)
  const [fileSearchResults,setFileSearchResults]=useState<GlobalSearchFileResult[]>([])
  const [searchingFiles,setSearchingFiles]=useState(false)
  const [update,setUpdate]=useState('')
  const [context,setContext]=useState<{x:number;y:number;project:Project}|null>(null)
  const [dayContext,setDayContext]=useState<{x:number;y:number;date:Date}|null>(null)
  const dateInput=useRef<HTMLInputElement>(null)
  const [now,setNow]=useState(new Date())
  const load=async()=>{const s=await window.eazyflow.getSnapshot();setProjects(s.projects);setGroups(s.groups||[]);setSupportTargets(s.supportTargets||[]);setSettings(s.settings);setStorageRoot(s.storageRoot)}
  useEffect(()=>{load();const sync=()=>load();window.addEventListener('focus',sync);window.eazyflow.getAppVersion().then(setAppVersion).catch(()=>{});const unsubscribe=window.eazyflow.onUpdateStatus(setUpdate);return()=>{window.removeEventListener('focus',sync);unsubscribe()}},[])
  useEffect(()=>{
    const preset=themePresets.find(item=>item.id===(settings?.appearancePreset||defaultSchedule.appearancePreset))||themePresets[0]
    const palette={...preset.colors,...(settings?.customAppearanceEnabled?settings.customAppearance:{})}
    const root=document.documentElement
    for(const [key,value] of Object.entries(palette))root.style.setProperty(`--theme-${key}`,value)
    const hex=palette.sidebar.replace('#',''),rgb=[0,2,4].map(index=>parseInt(hex.slice(index,index+2),16)),brightness=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000
    root.style.setProperty('--theme-sidebar-ink',brightness>150?'#292633':'#f7f6fa')
    root.style.setProperty('--theme-sidebar-muted',brightness>150?'#777280':'#aaa5b2')
  },[settings])
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),30000);return()=>window.clearInterval(timer)},[])
  useEffect(()=>{const close=()=>{setContext(null);setDayContext(null)};window.addEventListener('click',close);return()=>window.removeEventListener('click',close)},[])
  useEffect(()=>{
    const needle=search.trim()
    if(!needle){setFileSearchResults([]);setSearchingFiles(false);return}
    let cancelled=false
    setFileSearchResults([])
    setSearchingFiles(true)
    const timer=window.setTimeout(()=>window.eazyflow.searchFiles(needle).then(results=>{if(!cancelled)setFileSearchResults(results)}).catch(()=>{if(!cancelled)setFileSearchResults([])}).finally(()=>{if(!cancelled)setSearchingFiles(false)}),220)
    return()=>{cancelled=true;window.clearTimeout(timer)}
  },[search])
  const active=projects.find(p=>p.id===activeId)
  const activeGroup=groups.find(group=>group.id===activeGroupId)
  const searchNeedle=search.trim().toLocaleLowerCase('zh-CN')
  const projectSearchResults=searchNeedle?projects.filter(p=>`${p.name} ${p.description} ${p.supportTarget||''}`.toLocaleLowerCase('zh-CN').includes(searchNeedle)).slice(0,20):[]
  const recentProjectDays=settings?.recentProjectDays??defaultSchedule.recentProjectDays
  const recentProjects=projects.filter(p=>{
    if(recentProjectDays===0)return true
    return projectCreatedTimestamp(p)>=now.getTime()-recentProjectDays*86400000
  }).sort((a,b)=>projectCreatedTimestamp(b)-projectCreatedTimestamp(a))
  const openProject=async(p:Project)=>{setActiveGroupId(null);setActiveId(p.id);setContext(null);try{await window.eazyflow.touchProject(p.id);await load()}catch{/* 项目详情仍可打开 */}}
  const clearSearch=()=>{setSearch('');setSearchOpen(false)}
  const openSearchProject=(project:Project)=>{clearSearch();openProject(project)}
  const openSearchFile=async(result:GlobalSearchFileResult)=>{clearSearch();try{await window.eazyflow.openFolderEntry(result.projectId,result.category,result.relativePath);await window.eazyflow.touchProject(result.projectId);await load()}catch(error){alert(error instanceof Error?error.message:'无法打开搜索结果')}}
  const openGroup=(group:ProjectGroup)=>{setActiveId(null);setActiveGroupId(group.id);setPage('library')}
  const createSupportTarget=async(name:string)=>{const target=await window.eazyflow.createSupportTarget(name);await load();return target}
  const remove=async(p:Project)=>{
    if(!confirm(`删除项目“${p.name}”？\n\n项目文件夹会移入 Windows 回收站，项目记录将从 EazyFlow 中移除。`))return
    await window.eazyflow.deleteProject(p.id);if(activeId===p.id)setActiveId(null);setContext(null);await load()
  }
  const showContext=(e:React.MouseEvent,p:Project)=>{e.preventDefault();setContext({x:e.clientX,y:e.clientY,project:p})}
  const setDayOverride=async(date:Date,value?:DayOverride)=>{if(!settings)return;const key=dateKey(date),next={...settings.dayOverrides};if(value)next[key]=value;else delete next[key];const updated={...settings,dayOverrides:next};await window.eazyflow.updateSettings(updated);setSettings(updated);setDayContext(null)}
  const sidebarCollapsed=settings?.sidebarCollapsed===true
  const toggleSidebar=()=>{const updated={...(settings||defaultSchedule),sidebarCollapsed:!sidebarCollapsed};setSettings(updated);void window.eazyflow.updateSettings(updated).catch(()=>load())}
  return <div className={`app-shell ${sidebarCollapsed?'sidebar-collapsed':''}`}>
    <div className="window-drag-region" aria-hidden="true"/>
    <aside className={`sidebar ${sidebarCollapsed?'collapsed':''}`}>
      <div className="brand"><img className="brand-mark" src={appIcon} alt=""/><span>EazyFlow</span><button className="sidebar-toggle" onClick={toggleSidebar} title={sidebarCollapsed?'展开侧栏':'收起侧栏'} aria-label={sidebarCollapsed?'展开侧栏':'收起侧栏'}>{sidebarCollapsed?<PanelLeftOpen/>:<PanelLeftClose/>}</button></div>
      <button className="primary wide sidebar-create" onClick={()=>setCreating(true)} title={sidebarCollapsed?'新建项目':undefined} aria-label="新建项目"><Plus/><span>新建项目</span></button>
      <nav><button title={sidebarCollapsed?'时间表':undefined} aria-label="时间表" className={!active&&!activeGroup&&page==='timeline'?'selected':''} onClick={()=>{setActiveId(null);setActiveGroupId(null);setPage('timeline')}}><CalendarDays/><span>时间表</span></button><button title={sidebarCollapsed?'项目库':undefined} aria-label="项目库" className={!active&&!activeGroup&&page==='library'?'selected':''} onClick={()=>{setActiveId(null);setActiveGroupId(null);setPage('library')}}><Library/><span>项目库</span></button><div className="nav-caption">最近 {recentProjectDays?`${recentProjectDays} 天`:'全部'}</div><div className="recent-projects">{recentProjects.map(p=><button key={p.id} title={sidebarCollapsed?p.name:undefined} aria-label={p.name} className={active?.id===p.id?'selected':''} onClick={()=>openProject(p)}><i style={{background:p.color}}/><span>{p.name}</span></button>)}{recentProjects.length===0&&<small>暂无最近创建项目</small>}</div></nav>
      <div className="sidebar-bottom"><button title={sidebarCollapsed?'设置':undefined} aria-label="设置" className={!active&&!activeGroup&&page==='settings'?'selected':''} onClick={()=>{setActiveId(null);setActiveGroupId(null);setPage('settings')}}><Settings2/><span>设置</span></button></div>
    </aside>
    <main>{active?<ProjectPage project={active} projects={projects} groups={groups} supportTargets={supportTargets} createSupportTarget={createSupportTarget} now={now} backLabel={page==='library'?'返回项目库':page==='settings'?'返回设置':'返回时间表'} onBack={()=>setActiveId(null)} onOpenGroup={openGroup} onChanged={load} onDelete={()=>remove(active)}/>:activeGroup?<ProjectGroupPage group={activeGroup} projects={projects} groups={groups} now={now} onBack={()=>setActiveGroupId(null)} onOpen={openProject} onChanged={load}/>:page==='settings'&&settings?<SettingsPage storageRoot={storageRoot} settings={settings} update={update} appVersion={appVersion} onSettingsChanged={async next=>{await window.eazyflow.updateSettings(next);setSettings(next)}} onStorageChanged={load}/>:page==='library'?<ProjectLibrary projects={projects} groups={groups} supportTargets={supportTargets} createSupportTarget={createSupportTarget} onChanged={load} now={now} onOpen={openProject} onOpenGroup={openGroup}/>:<>
      <header className="topbar"><div className="date-title"><p className="eyebrow">工作概览</p><div><button className="date-picker-trigger" onClick={()=>{const input=dateInput.current;if(!input)return;try{input.showPicker()}catch{input.click()}}} aria-label={`选择日期，当前为 ${format(cursor,'yyyy年M月d日 EEEE',{locale:zhCN})}`}><h1>{view==='hour'?format(cursor,'M月d日 EEEE',{locale:zhCN}):format(cursor,'yyyy年 M月',{locale:zhCN})}</h1><CalendarDays aria-hidden="true"/></button><input ref={dateInput} className="date-picker-input" type="date" value={dateKey(cursor)} onChange={event=>{if(event.target.value)setCursor(parseISO(event.target.value))}} aria-label="选择日期"/><div className="date-nav"><button aria-label="上一个日期" onClick={()=>setCursor(view==='hour'?addDays(cursor,-1):subMonths(cursor,1))}><ChevronLeft/></button><button className="today" onClick={()=>setCursor(new Date())}>今天</button><button aria-label="下一个日期" onClick={()=>setCursor(view==='hour'?addDays(cursor,1):addMonths(cursor,1))}><ChevronRight/></button></div></div></div><div className="top-actions"><div className="segmented view-switch"><button className={view==='hour'?'active':''} onClick={()=>setView('hour')}><Clock3/>小时表</button><button className={view==='month'?'active':''} onClick={()=>setView('month')}><LayoutGrid/>月历</button></div><button className="schedule-button" onClick={()=>setScheduleOpen(true)}><Settings2/>工作日历</button><GlobalSearch query={search} open={searchOpen} projects={projectSearchResults} files={fileSearchResults} loading={searchingFiles} onQuery={value=>{setSearch(value);setSearchOpen(true)}} onFocus={()=>setSearchOpen(true)} onClose={()=>setSearchOpen(false)} onClear={clearSearch} onOpenProject={openSearchProject} onOpenFile={openSearchFile}/></div></header>
      {settings&&(view==='hour'?<HourView date={cursor} now={now} projects={projects} settings={settings} onOpen={openProject} onContext={showContext}/>:<MonthView month={cursor} now={now} projects={projects} settings={settings} onOpen={openProject} onOpenDay={date=>{setCursor(date);setView('hour')}} onContext={showContext} onDateContext={(e,date)=>{e.preventDefault();setDayContext({x:e.clientX,y:e.clientY,date})}}/>)}
    </>}</main>
    {creating&&<CreateProject projects={projects} groups={groups} supportTargets={supportTargets} createSupportTarget={createSupportTarget} onClose={()=>setCreating(false)} onCreated={async()=>{setCreating(false);await load()}}/>}
    {settings===null&&<ScheduleModal required value={defaultSchedule} onSave={async s=>{await window.eazyflow.updateSettings(s);setSettings(s)}}/>}
    {scheduleOpen&&settings&&<ScheduleModal value={settings} onClose={()=>setScheduleOpen(false)} onSave={async s=>{await window.eazyflow.updateSettings(s);setSettings(s);setScheduleOpen(false)}}/>}
    {context&&<ContextMenu {...context} onOpen={()=>openProject(context.project)} onDelete={()=>remove(context.project)}/>}
    {dayContext&&settings&&<DayContextMenu {...dayContext} current={settings.dayOverrides?.[dateKey(dayContext.date)]} onChoose={value=>setDayOverride(dayContext.date,value)}/>}
  </div>
}

function GlobalSearch({query,open,projects,files,loading,onQuery,onFocus,onClose,onClear,onOpenProject,onOpenFile}:{query:string;open:boolean;projects:Project[];files:GlobalSearchFileResult[];loading:boolean;onQuery:(value:string)=>void;onFocus:()=>void;onClose:()=>void;onClear:()=>void;onOpenProject:(project:Project)=>void;onOpenFile:(file:GlobalSearchFileResult)=>void}){
  const showing=open&&Boolean(query.trim()),empty=!loading&&projects.length===0&&files.length===0
  return <div className="global-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))onClose()}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onClear()}}}>
    <div className="search"><Search/><input value={query} onChange={event=>onQuery(event.currentTarget.value)} onFocus={onFocus} placeholder="搜索项目或文件" aria-label="全局搜索项目或文件" aria-expanded={showing}/>{query&&<button className="search-clear" onClick={onClear} aria-label="清除搜索"><X/></button>}</div>
    {showing&&<div className="global-search-results">
      {projects.length>0&&<section className="global-search-section"><div className="global-search-heading"><span>项目</span><em>{projects.length}</em></div>{projects.map(project=><button className="global-search-result" key={project.id} onClick={()=>onOpenProject(project)}><i className="global-search-project-mark" style={{background:project.color}}/><span><b>{project.name}</b><small>{project.description||project.supportTarget||'打开项目详情'}</small></span></button>)}</section>}
      {files.length>0&&<section className="global-search-section"><div className="global-search-heading"><span>文件与文件夹</span><em>{files.length}{files.length===80?'＋':''}</em></div>{files.map(file=>{const category=categories.find(item=>item.id===file.category)!,parent=file.relativePath.split('/').slice(0,-1).join(' / ');return <button className="global-search-result" key={`${file.projectId}:${file.category}:${file.relativePath}`} onClick={()=>onOpenFile(file)}>{file.kind==='folder'?<FolderOpen/>:<FileIcon/>}<span><b>{file.name}</b><small>{file.projectName} · {category.label}{parent?` / ${parent}`:''}</small></span></button>})}</section>}
      {loading&&<div className="global-search-empty">正在搜索项目文件…</div>}
      {empty&&<div className="global-search-empty">没有找到匹配的项目或文件</div>}
    </div>}
  </div>
}

function SettingsPage({storageRoot,settings,update,appVersion,onSettingsChanged,onStorageChanged}:{storageRoot:string;settings:WorkSettings;update:string;appVersion:string;onSettingsChanged:(settings:WorkSettings)=>void|Promise<void>;onStorageChanged:()=>void}){
  const [customColors,setCustomColors]=useState(settings.customAppearance)
  const customColorsRef=useRef(settings.customAppearance)
  const customColorTimer=useRef<number|undefined>(undefined)
  useEffect(()=>{customColorsRef.current=settings.customAppearance;setCustomColors(settings.customAppearance)},[settings.customAppearance])
  useEffect(()=>()=>{if(customColorTimer.current!==undefined)window.clearTimeout(customColorTimer.current)},[])
  const changeCustomColor=(id:keyof WorkSettings['customAppearance'],color:string)=>{
    const nextColors={...customColorsRef.current,[id]:color}
    customColorsRef.current=nextColors;setCustomColors(nextColors)
    document.documentElement.style.setProperty(`--theme-${id}`,color)
    if(customColorTimer.current!==undefined)window.clearTimeout(customColorTimer.current)
    customColorTimer.current=window.setTimeout(()=>{
      customColorTimer.current=undefined
      void Promise.resolve(onSettingsChanged({...settings,customAppearance:nextColors})).catch(error=>alert(error instanceof Error?`外观设置保存失败：${error.message}`:'外观设置保存失败，请重试'))
    },120)
  }
  const selectedPreset=themePresets.find(item=>item.id===settings.appearancePreset)||themePresets[0]
  const changeStorage=async()=>{try{const next=await window.eazyflow.selectStorageRoot();if(next)await onStorageChanged()}catch(error){alert(error instanceof Error?error.message:'无法更改存储位置')}}
  const togglePrereleases=async(receivePrereleases:boolean)=>{
    await onSettingsChanged({...settings,receivePrereleases})
    window.eazyflow.checkForUpdates()
  }
  return <div className="settings-page">
    <header className="settings-header"><p className="eyebrow">EazyFlow</p><h1>设置</h1><p>调整工作区的日常偏好与软件行为。</p></header>
    <section className="settings-card"><div className="settings-card-icon"><FolderOpen/></div><div className="settings-card-body"><h2>项目文件存储</h2><p>项目目录以项目名命名，仅在实际存入内容时创建对应的分类子文件夹。</p><div className="storage-path" title={storageRoot}>{storageRoot}</div><small>更改位置时，现有项目会先完整复制到新位置，再切换数据库记录；原目录随后移入回收站。</small></div><div className="settings-card-actions"><button className="secondary" onClick={()=>window.eazyflow.revealStorageRoot()}><ExternalLink/>打开位置</button><button className="primary" onClick={changeStorage}>更改位置</button></div></section>
    <section className="settings-card"><div className="settings-card-icon"><Clock3/></div><div className="settings-card-body"><h2>最近项目</h2><p>侧栏按项目创建时间显示所选范围内的项目；打开旧项目不会延长它的最近期限。</p><label className="inline-setting">显示范围<select value={settings.recentProjectDays} onChange={e=>onSettingsChanged({...settings,recentProjectDays:Number(e.target.value)})}><option value={1}>最近 1 天</option><option value={3}>最近 3 天</option><option value={7}>最近 7 天</option><option value={14}>最近 14 天</option><option value={30}>最近 30 天</option><option value={0}>全部项目</option></select></label></div></section>
    <section className="settings-card appearance-card"><div className="settings-card-icon"><Palette/></div><div className="settings-card-body"><h2>外观主题</h2><p>选择一套协调的界面配色。逾期、完成等功能状态色保持固定，避免混淆。</p><div className="theme-presets" role="group" aria-label="外观主题">{themePresets.map(preset=><button key={preset.id} className={`theme-preset ${settings.appearancePreset===preset.id?'selected':''}`} aria-pressed={settings.appearancePreset===preset.id} onClick={()=>onSettingsChanged({...settings,appearancePreset:preset.id})}><span className="theme-swatch" style={{'--swatch-page':preset.colors.page,'--swatch-surface':preset.colors.surface,'--swatch-sidebar':preset.colors.sidebar,'--swatch-accent':preset.colors.accent,'--swatch-tag':preset.colors.tag} as React.CSSProperties}><i/><b/><em/></span><span>{preset.name}</span></button>)}</div></div></section>
    <section className="settings-card update-card"><div className="settings-card-icon"><RefreshCw/></div><div className="settings-card-body"><h2>软件更新</h2><p>当前版本 v{appVersion||'—'} · {update||'检查是否有可用更新。'}</p></div><div className="settings-card-actions">{update.includes('已下载')&&<button className="primary" onClick={()=>window.eazyflow.installUpdate()}>安装更新</button>}<button className="secondary" onClick={()=>window.eazyflow.checkForUpdates()}><RefreshCw/>检查更新</button></div></section>
    <details className="advanced-settings"><summary><span><Settings2/>高级设置</span><ChevronRight/></summary><div className="advanced-settings-content">
      <section className="advanced-option"><div><h2>自定义外观</h2><p>开放品牌、界面、侧栏和标签等非功能色的独立搭配；状态提示色不会被修改。</p></div><label className="switch-control"><input type="checkbox" checked={settings.customAppearanceEnabled} onChange={e=>onSettingsChanged({...settings,customAppearanceEnabled:e.target.checked})}/><span>启用完整自定义</span></label></section>
      {settings.customAppearanceEnabled&&<div className="theme-customization">{appearanceFields.map(field=><label className="theme-color-control" key={field.id}><span>{field.label}</span><span><input type="color" value={customColors?.[field.id]||selectedPreset.colors[field.id]} onChange={e=>changeCustomColor(field.id,e.currentTarget.value)}/><code>{customColors?.[field.id]||selectedPreset.colors[field.id]}</code></span></label>)}</div>}
      <section className="advanced-option update-advanced"><div><h2>测试版更新</h2><p>启用后，软件检查更新时也会提供尚未正式发布的测试版本。</p><label className="switch-control"><input type="checkbox" checked={settings.receivePrereleases} onChange={e=>togglePrereleases(e.target.checked)}/><span>接受测试版更新</span></label></div></section>
    </div></details>
  </div>
}

function ProjectLibrary({projects,groups,supportTargets,createSupportTarget,onChanged,now,onOpen,onOpenGroup}:{projects:Project[];groups:ProjectGroup[];supportTargets:SupportTarget[];createSupportTarget:(name:string)=>Promise<SupportTarget>;onChanged:()=>void;now:Date;onOpen:(project:Project)=>void;onOpenGroup:(group:ProjectGroup)=>void}){
  const [mode,setMode]=useState<'projects'|'groups'|'supports'>('projects'),[query,setQuery]=useState(''),[status,setStatus]=useState<'all'|'active'|'completed'|'overdue'|'upcoming'>('all'),[due,setDue]=useState<'all'|'dated'|'undated'>('all'),[sort,setSort]=useState<'start-desc'|'start-asc'|'created-desc'|'due-asc'|'name'>('start-desc'),[selectedSupport,setSelectedSupport]=useState(''),[editingSupport,setEditingSupport]=useState<SupportTarget|null|undefined>(undefined)
  const needle=query.trim().toLocaleLowerCase('zh-CN')
  const shown=projects.filter(p=>{const display=effectiveStatus(p,now),haystack=`${p.name} ${p.description} ${p.supportTarget||''}`.toLocaleLowerCase('zh-CN');return haystack.includes(needle)&&(status==='all'||status==='active'&&display==='进行中'&&!isOverdue(p,now)||status==='completed'&&display==='已完成'||status==='overdue'&&isOverdue(p,now)||status==='upcoming'&&display==='未开始')&&(due==='all'||due==='dated'&&Boolean(p.dueAt)||due==='undated'&&!p.dueAt)}).sort((a,b)=>sort==='start-desc'?parseISO(b.startAt).getTime()-parseISO(a.startAt).getTime():sort==='start-asc'?parseISO(a.startAt).getTime()-parseISO(b.startAt).getTime():sort==='created-desc'?parseISO(b.createdAt).getTime()-parseISO(a.createdAt).getTime():sort==='due-asc'?(a.dueAt?parseISO(a.dueAt).getTime():Number.MAX_SAFE_INTEGER)-(b.dueAt?parseISO(b.dueAt).getTime():Number.MAX_SAFE_INTEGER):a.name.localeCompare(b.name,'zh-CN'))
  const shownGroups=groups.filter(group=>{const members=projects.filter(project=>project.groupId===group.id);return `${group.name} ${group.description} ${members.map(p=>p.supportTarget||'').join(' ')}`.toLocaleLowerCase('zh-CN').includes(needle)}).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))
  const supportItems=supportTargets.map(target=>({key:target.id,label:target.name,target:target as SupportTarget|undefined,projects:projects.filter(project=>project.supportTargetId===target.id||(!project.supportTargetId&&project.supportTarget?.trim()===target.name))})).sort((a,b)=>a.label.localeCompare(b.label,'zh-CN'))
  const withoutTarget=projects.filter(project=>!project.supportTargetId&&!project.supportTarget?.trim())
  if(withoutTarget.length)supportItems.push({key:'__unassigned__',label:'未填写支撑对象',target:undefined,projects:withoutTarget})
  const filteredSupports=supportItems.filter(item=>item.label.toLocaleLowerCase('zh-CN').includes(needle)||item.projects.some(project=>`${project.name} ${project.description}`.toLocaleLowerCase('zh-CN').includes(needle)))
  const activeSupport=filteredSupports.find(item=>item.key===selectedSupport)||filteredSupports[0]
  const supportProjects=activeSupport?.projects.filter(project=>!needle||activeSupport.label.toLocaleLowerCase('zh-CN').includes(needle)||`${project.name} ${project.description}`.toLocaleLowerCase('zh-CN').includes(needle))||[]
  return <div className="library-page">
    <header className="library-header"><div><p className="eyebrow">全部工作</p><h1>项目库</h1><p>按项目、关联组或服务对象，找到相关工作。</p></div><div className="library-search"><Search/><input value={query} onChange={e=>setQuery(e.currentTarget.value)} placeholder={mode==='projects'?'搜索名称、说明或支撑对象':mode==='supports'?'搜索支撑对象或项目':'搜索关联组'}/></div></header>
    <div className="library-mode segmented" role="group" aria-label="项目库视图"><button aria-pressed={mode==='projects'} className={mode==='projects'?'active':''} onClick={()=>setMode('projects')}><Library/>项目 <em>{projects.length}</em></button><button aria-pressed={mode==='groups'} className={mode==='groups'?'active':''} onClick={()=>setMode('groups')}><Link2/>关联组 <em>{groups.length}</em></button><button aria-pressed={mode==='supports'} className={mode==='supports'?'active':''} onClick={()=>setMode('supports')}><BriefcaseBusiness/>支撑对象 <em>{supportItems.length}</em></button></div>
    {mode==='supports'&&<div className="support-tag-toolbar"><span>支撑对象是可复用标签，项目可直接选择已有对象。</span><div><button className="secondary" onClick={()=>setEditingSupport(null)}><Plus/>新增支撑对象</button>{activeSupport?.target&&<button className="secondary" disabled={activeSupport.projects.length>0} title={activeSupport.projects.length?'先将关联项目改选其他支撑对象':'删除支撑对象'} onClick={async()=>{if(!activeSupport.projects.length&&confirm(`删除支撑对象“${activeSupport.label}”？`)){await window.eazyflow.deleteSupportTarget(activeSupport.key);setSelectedSupport('');await onChanged()}}}><Trash2/>删除未使用标签</button>}</div></div>}
    {mode==='projects'?<><section className="library-filters"><label>状态<select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="all">全部状态</option><option value="active">进行中</option><option value="upcoming">未开始</option><option value="overdue">已逾期</option><option value="completed">已完成</option></select></label><label>交付时间<select value={due} onChange={e=>setDue(e.target.value as typeof due)}><option value="all">全部项目</option><option value="dated">已设交付</option><option value="undated">未定交付</option></select></label><label>排序<select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="start-desc">开始时间：新到旧</option><option value="start-asc">开始时间：旧到新</option><option value="created-desc">创建时间：新到旧</option><option value="due-asc">交付时间：近到远</option><option value="name">项目名称</option></select></label><span>{shown.length} 个结果</span></section>{shown.length?<section className="project-library-list">{shown.map(p=>{const display=effectiveStatus(p,now),overdue=isOverdue(p,now),group=groups.find(item=>item.id===p.groupId);return <article key={p.id} className={`library-project ${overdue?'overdue-library':''} ${group?'continued-project':''}`} onDoubleClick={()=>onOpen(p)} title="双击进入项目详情"><i style={{background:overdue?'#d0444f':p.color}}/><div className="library-project-main"><h3>{p.name}</h3><p>{group&&<span className="relation-inline"><Layers/>{group.name}</span>}{p.description||'暂无项目说明'}</p>{p.supportTarget&&<small className="support-target">支撑对象：{p.supportTarget}</small>}</div><div><span>开始</span><b>{format(parseISO(p.startAt),'yyyy/M/d HH:mm')}</b></div><div><span>计划交付</span><b>{p.dueAt?format(parseISO(p.dueAt),'yyyy/M/d HH:mm'):'未设置'}</b></div><div><span>结束时间</span><b>{p.completedAt?format(parseISO(p.completedAt),'yyyy/M/d HH:mm'):'尚未结束'}</b></div><em className={`library-status ${overdue?'late':''}`}>{overdue?'已逾期':display}</em></article>})}</section>:<Empty title="没有符合条件的项目" text="尝试调整搜索、状态或交付时间筛选。"/>}</>:mode==='groups'?(shownGroups.length?<section className="group-library-grid">{shownGroups.map(group=>{const members=projects.filter(project=>project.groupId===group.id),finished=members.filter(project=>project.status==='已完成').length;return <article className="group-library-card" key={group.id} onDoubleClick={()=>onOpenGroup(group)} title="双击查看关联组"><i style={{background:group.color}}/><div><ProjectTag/><h3>{group.name}</h3><p>{group.description||'暂无项目组说明'}</p></div><dl><div><dt>关联项目</dt><dd>{members.length} 个</dd></div><div><dt>完成进度</dt><dd>{finished}/{members.length}</dd></div></dl><button onClick={()=>onOpenGroup(group)}>查看成员<ArrowRight/></button></article>})}</section>:<Empty title="还没有关联组" text="可在新建或编辑项目时加入已有组，或直接创建新的关联组。"/>):supportItems.length?<section className="support-explorer"><nav className="support-index" aria-label="支撑对象列表"><div className="support-index-heading"><span>支撑对象</span><b>{filteredSupports.length}</b></div>{filteredSupports.map(item=><button key={item.key} className={activeSupport?.key===item.key?'selected':''} onClick={()=>setSelectedSupport(item.key)}><span className="support-index-icon"><BriefcaseBusiness/></span><span className="support-index-label">{item.label}</span><em>{item.projects.length}</em></button>)}</nav>{activeSupport?<section className="support-detail"><header className="support-detail-header"><div className="support-detail-icon"><BriefcaseBusiness/></div><div><p className="eyebrow">支撑对象 · {activeSupport.projects.length} 个项目</p><h2>{activeSupport.label}</h2></div><span className="support-project-count">{supportProjects.length}<small>当前显示</small></span>{activeSupport.target&&<button className="support-detail-edit" onClick={()=>setEditingSupport(activeSupport.target)}><Edit3/>编辑标签</button>}</header>{supportProjects.length?<div className="support-project-list">{supportProjects.map(project=>{const overdue=isOverdue(project,now),status=overdue?'已逾期':effectiveStatus(project,now),group=groups.find(item=>item.id===project.groupId);return <button key={project.id} className="support-project-card" onClick={()=>onOpen(project)}><i style={{'--project-color':project.color} as React.CSSProperties}/><span className="support-project-main"><b>{project.name}</b><small>{group?`${group.name} · `:''}{project.description||'暂无项目说明'}</small></span><span className="support-project-date"><small>{project.dueAt?'计划交付':'开始时间'}</small><b>{project.dueAt?format(parseISO(project.dueAt),'yyyy/M/d'):format(parseISO(project.startAt),'yyyy/M/d')}</b></span><em className={`library-status ${overdue?'late':''}`}>{status}</em><ArrowRight/></button>})}</div>:<Empty title="该支撑对象下没有匹配项目" text="换个关键词，或从左侧选择其他支撑对象。"/>}</section>:<Empty title="没有匹配的支撑对象" text="尝试更短的关键词。"/>}</section>:<Empty title="还没有记录支撑对象" text="在项目的新建或编辑页面填写支撑对象后，相关项目会自动汇总到这里。"/>}
    {editingSupport!==undefined&&<SupportTargetEditor target={editingSupport} onClose={()=>setEditingSupport(undefined)} onSave={async name=>{const target=editingSupport?await window.eazyflow.updateSupportTarget(editingSupport.id,name):await createSupportTarget(name);setEditingSupport(undefined);setSelectedSupport(target.id);await onChanged()}}/>}
  </div>
}

function SupportTargetEditor({target,onClose,onSave}:{target:SupportTarget|null;onClose:()=>void;onSave:(name:string)=>Promise<void>}){
  const [name,setName]=useState(target?.name||''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><form className="modal support-target-modal" onSubmit={async event=>{event.preventDefault();if(!name.trim())return;setSaving(true);setError('');try{await onSave(name.trim())}catch(reason){setError(reason instanceof Error?reason.message:'无法保存支撑对象')}finally{setSaving(false)}}}><div className="modal-head"><div><p className="eyebrow">可复用标签</p><h2>{target?'编辑支撑对象':'新增支撑对象'}</h2></div><button type="button" onClick={onClose}><X/></button></div><p>同一个标签可分配给多个项目；更改名称会同步更新所有关联项目。</p><label>对象名称<input autoFocus maxLength={80} value={name} onChange={event=>setName(event.currentTarget.value)} placeholder="例如：张三、产品部、某客户"/></label>{error&&<p className="error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!name.trim()||saving}>{saving?'保存中…':target?'保存更改':'创建标签'}</button></div></form></div>
}

function SupportTargetPicker({targets,value,onChange,onCreate}:{targets:SupportTarget[];value:string;onChange:(id:string)=>void;onCreate:(name:string)=>Promise<SupportTarget>}){
  const [query,setQuery]=useState(''),[creating,setCreating]=useState(false),[newName,setNewName]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const filtered=targets.filter(target=>target.name.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN')))
  const add=async()=>{if(!newName.trim())return;setSaving(true);setError('');try{const target=await onCreate(newName.trim());onChange(target.id);setNewName('');setCreating(false);setQuery('')}catch(reason){setError(reason instanceof Error?reason.message:'无法创建支撑对象')}finally{setSaving(false)}}
  return <div className="support-picker"><div className="support-picker-heading"><span>支撑对象</span><small>为项目选择一个归属标签</small></div><div className="support-picker-search"><Search/><input value={query} onChange={event=>setQuery(event.currentTarget.value)} placeholder="查找已有对象" aria-label="查找支撑对象"/></div><div className="support-picker-options" role="group" aria-label="可选支撑对象"><button type="button" className={`support-chip ${value===''?'picked':''}`} aria-pressed={value===''} onClick={()=>onChange('')}>不指定</button>{filtered.map(target=><button type="button" key={target.id} className={`support-chip ${value===target.id?'picked':''}`} aria-pressed={value===target.id} onClick={()=>onChange(target.id)}>{target.name}</button>)}{filtered.length===0&&query&&<span className="support-picker-empty">没有同名标签，请通过“新增对象”创建。</span>}</div>{creating?<div className="support-picker-create"><input autoFocus maxLength={80} value={newName} onChange={event=>setNewName(event.currentTarget.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void add()}}} placeholder="输入新对象名称"/><button type="button" className="primary" disabled={!newName.trim()||saving} onClick={()=>void add()}>{saving?'创建中…':'创建并选择'}</button><button type="button" className="secondary" onClick={()=>{setCreating(false);setNewName('');setError('')}}>取消</button></div>:<button type="button" className="support-picker-add" onClick={()=>setCreating(true)}><Plus/>新增支撑对象标签</button>}{error&&<p className="error support-picker-error">{error}</p>}</div>
}

function HourView({date,now,projects,settings,onOpen,onContext}:{date:Date;now:Date;projects:Project[];settings:WorkSettings;onOpen:(p:Project)=>void;onContext:(e:React.MouseEvent,p:Project)=>void}){
  const [zoom,setZoom]=useState(100),[viewportWidth,setViewportWidth]=useState(0),[projectColumnWidth,setProjectColumnWidth]=useState(()=>window.innerWidth<=1200?190:210)
  const scrollRef=useRef<HTMLDivElement>(null),start=startOfDay(date),end=endOfDay(date)
  const working=isWorkingDate(date,settings)
  const shown=working?projects.filter(p=>parseISO(p.startAt)<=end&&projectEnd(p,now)>=start):[]
  useEffect(()=>{
    const element=scrollRef.current
    if(!element)return
    const observer=new ResizeObserver(entries=>setViewportWidth(entries[0]?.contentRect.width||element.clientWidth))
    observer.observe(element)
    setViewportWidth(element.clientWidth)
    return()=>observer.disconnect()
  },[shown.length])
  useEffect(()=>{
    const updateColumn=()=>setProjectColumnWidth(window.innerWidth<=1200?190:210)
    window.addEventListener('resize',updateColumn)
    return()=>window.removeEventListener('resize',updateColumn)
  },[])
  const workDuration=settings.endHour-settings.startHour,zoomRatio=zoom/100
  const visibleDuration=Math.min(24,workDuration/zoomRatio),midpoint=(settings.startHour+settings.endHour)/2
  const timelineStart=zoom<100?Math.max(0,Math.min(24-visibleDuration,midpoint-visibleDuration/2)):settings.startHour
  const timelineEnd=zoom<100?timelineStart+visibleDuration:settings.endHour
  const availableTimelineWidth=Math.max(240,viewportWidth-projectColumnWidth)
  const pixelsPerHour=viewportWidth>0?(zoom<100?availableTimelineWidth/visibleDuration:availableTimelineWidth/workDuration*zoomRatio):88*zoomRatio
  const width=Math.max(240,(timelineEnd-timelineStart)*pixelsPerHour)
  const firstHour=Math.ceil(timelineStart),lastHour=Math.floor(timelineEnd)
  const hours=Array.from({length:Math.max(0,lastHour-firstHour+1)},(_,i)=>firstHour+i)
  return <section className={`hour-card horizontal-hour ${working?'':'nonworking-view'}`}><div className="zoom-bar"><span>{working?'工作日':`休息日${settings.publicHolidays&&getFestival(dateKey(date))?` · ${getFestival(dateKey(date))}`:''}`} · {hourText(settings.startHour)}—{hourText(settings.endHour)} · 休息 {hourText(settings.breakStart)}—{hourText(settings.breakEnd)}</span><div><button aria-label="缩小时间刻度" title="缩小时间刻度" disabled={zoom<=60} onClick={()=>setZoom(z=>Math.max(60,z-10))}><ZoomOut/></button><button className="zoom-reset" aria-label="恢复适合窗口" title="恢复适合窗口" disabled={zoom===100} onClick={()=>setZoom(100)}>{zoom}%</button><button aria-label="放大时间刻度" title="放大时间刻度" disabled={zoom>=160} onClick={()=>setZoom(z=>Math.min(160,z+10))}><ZoomIn/></button></div></div>{shown.length===0?<Empty title={working?'这一天没有安排':'这是休息日'} text={working?'新建项目，或切换到其他日期查看。':'项目会跳过这一天；如需工作，请在月历中右键标记为加班。'}/>:<div className="horizontal-scroll" ref={scrollRef}><div className="horizontal-table" style={{width:projectColumnWidth+width,gridTemplateColumns:`${projectColumnWidth}px ${width}px`,gridTemplateRows:`48px repeat(${shown.length}, 136px)`}}><div className="hour-axis-label" style={{width:projectColumnWidth}}>项目</div><div className="hour-axis" style={{width}}>{hours.map(h=><span key={h} style={{left:(h-timelineStart)*pixelsPerHour}}>{hourText(h)}</span>)}</div>{shown.map(p=><HourRow key={p.id} project={p} date={date} now={now} settings={settings} timelineStart={timelineStart} timelineEnd={timelineEnd} pixelsPerHour={pixelsPerHour} projectColumnWidth={projectColumnWidth} timelineWidth={width} onOpen={()=>onOpen(p)} onContext={e=>onContext(e,p)}/>)}</div></div>}</section>
}

function HourRow({project,date,now,settings,timelineStart,timelineEnd,pixelsPerHour,projectColumnWidth,timelineWidth,onOpen,onContext}:{project:Project;date:Date;now:Date;settings:WorkSettings;timelineStart:number;timelineEnd:number;pixelsPerHour:number;projectColumnWidth:number;timelineWidth:number;onOpen:()=>void;onContext:(e:React.MouseEvent)=>void}){
  const start=parseISO(project.startAt),due=project.dueAt?parseISO(project.dueAt):null,completed=project.status==='已完成',overdue=isOverdue(project,now),followsNow=!completed&&(!due||now>due),actualEnd=completed&&project.completedAt?parseISO(project.completedAt):followsNow?now:due
  const rawStart=isSameDay(start,date)?start.getHours()+start.getMinutes()/60:start<startOfDay(date)?0:24
  const rawEnd=actualEnd?(isSameDay(actualEnd,date)?actualEnd.getHours()+actualEnd.getMinutes()/60:actualEnd<startOfDay(date)?0:24):24
  const a=Math.max(timelineStart,Math.min(timelineEnd,rawStart)),b=Math.min(timelineEnd,Math.max(a+.15,Math.min(timelineEnd,rawEnd)))
  const showNow=isSameDay(now,date)&&now.getHours()+now.getMinutes()/60>=timelineStart&&now.getHours()+now.getMinutes()/60<=timelineEnd
  return <div className={`horizontal-row ${completed?'completed-row':''} ${overdue?'overdue-row':''} ${project.groupId?'continued-row':''}`} style={{gridTemplateColumns:`${projectColumnWidth}px ${timelineWidth}px`}} onContextMenu={onContext}>
    <button className="row-project" onDoubleClick={onOpen}><i style={{background:overdue?'#d0444f':project.color}}/><span><span className="row-title-line"><b>{project.name}</b>{project.groupId&&<ProjectTag/>}</span><small>{completed?'✓ 已完成':overdue?'! 已逾期':effectiveStatus(project,now)}</small></span></button>
    <div className="row-timeline" style={{width:timelineWidth,backgroundSize:`${pixelsPerHour}px 100%`}}><div className="break-band" style={{left:(settings.breakStart-timelineStart)*pixelsPerHour,width:(settings.breakEnd-settings.breakStart)*pixelsPerHour}}/><button className={`horizontal-bubble ${followsNow?'open-ended':''} ${completed?'completed-bubble':''} ${overdue?'overdue-bubble':''} ${project.groupId?'continued-bubble':''}`} style={{left:(a-timelineStart)*pixelsPerHour,width:Math.max(34,(b-a)*pixelsPerHour),'--bubble':project.color} as React.CSSProperties} onDoubleClick={onOpen} title={`${project.name}\n${project.groupId?'属于关联项目组\n':''}${format(start,'M月d日 HH:mm')} 开始\n${completed&&project.completedAt?'实际结束 '+format(parseISO(project.completedAt),'M月d日 HH:mm'):overdue&&due?'已超过计划交付 '+format(due,'M月d日 HH:mm'):due?format(due,'M月d日 HH:mm')+' 计划交付':'结束时间未定'}\n双击进入，右键管理`}><b>{completed?'✓ ':overdue?'! ':''}{project.name}</b><small>{hourText(a)}—{hourText(b)}{followsNow?' · 随当前时间推进':''}</small></button>{showNow&&!completed&&<div className="now-line" style={{left:(now.getHours()+now.getMinutes()/60-timelineStart)*pixelsPerHour}}/>}</div>
  </div>
}

function MonthView({month,now,projects,settings,onOpen,onOpenDay,onContext,onDateContext}:{month:Date;now:Date;projects:Project[];settings:WorkSettings;onOpen:(p:Project)=>void;onOpenDay:(date:Date)=>void;onContext:(e:React.MouseEvent,p:Project)=>void;onDateContext:(e:React.MouseEvent,date:Date)=>void}){
  const start=startOfWeek(startOfMonth(month),{weekStartsOn:1}),end=endOfWeek(endOfMonth(month),{weekStartsOn:1}),days=eachDayOfInterval({start,end})
  const onDay=(p:Project,d:Date)=>{
    if(!isWorkingDate(d,settings))return false
    const projectStart=startOfDay(parseISO(p.startAt)),projectFinish=endOfDay(projectEnd(p,now))
    return projectStart<=projectFinish&&isWithinInterval(d,{start:projectStart,end:projectFinish})
  }
  return <section className="month-card"><div className="weekdays">{'一二三四五六日'.split('').map(d=><span key={d}>周{d}</span>)}</div><div className="month-grid">{days.map(day=>{const all=projects.filter(p=>onDay(p,day)),working=isWorkingDate(day,settings),festival=settings.publicHolidays?getFestival(dateKey(day)):'',override=settings.dayOverrides?.[dateKey(day)];return <div onDoubleClick={()=>onOpenDay(day)} onContextMenu={e=>onDateContext(e,day)} className={`day ${!isSameMonth(day,month)?'muted':''} ${isSameDay(day,now)?'today-day':''} ${working?'':'rest-day'} ${override?`override-${override}`:''}`} key={dateKey(day)} title="双击查看当天小时表"><span className="day-num">{format(day,'d')}</span><small className="day-kind">{override==='leave'?'请假':override==='timeoff'?'调休':override==='overtime'?'加班':festival||(working?'工作日':'休息')}</small><div className="day-items">{all.map(p=>{const begins=isSameDay(day,parseISO(p.startAt)),completed=p.status==='已完成',overdue=isOverdue(p,now),afterDue=overdue&&p.dueAt&&day>=startOfDay(parseISO(p.dueAt)),last=isSameDay(day,projectEnd(p,now));return <button key={p.id} onDoubleClick={e=>{e.stopPropagation();onOpen(p)}} onContextMenu={e=>{e.stopPropagation();onContext(e,p)}} className={`month-pill ${!p.dueAt?'undated':''} ${completed?'completed-pill':''} ${afterDue?'overdue-pill':''} ${p.groupId?'continued-pill has-project-tags':''}`} style={{'--bubble':p.color} as React.CSSProperties} title={`${p.name}\n${p.groupId?'属于关联项目组\n':''}${p.description}\n${completed&&p.completedAt?'实际结束 '+format(parseISO(p.completedAt),'M月d日 HH:mm'):overdue&&p.dueAt?'已超过计划交付 '+format(parseISO(p.dueAt),'M月d日 HH:mm'):p.dueAt?'计划交付 '+format(parseISO(p.dueAt),'M月d日 HH:mm'):'结束时间未定'}`}><span>{completed&&last?'✓ ':afterDue?'! ':''}{begins?p.name:`↪ ${p.name}`}</span><span className="month-pill-meta">{afterDue?<em>逾期</em>:!p.dueAt&&!completed?<em>{last?'今日延伸':'持续中'}</em>:null}{p.groupId&&begins&&<ProjectTag compact attached/>}</span></button>})}</div></div>})}</div></section>
}

function ProjectPage({project,projects,groups,supportTargets,createSupportTarget,now,backLabel,onBack,onOpenGroup,onChanged,onDelete}:{project:Project;projects:Project[];groups:ProjectGroup[];supportTargets:SupportTarget[];createSupportTarget:(name:string)=>Promise<SupportTarget>;now:Date;backLabel:string;onBack:()=>void;onOpenGroup:(group:ProjectGroup)=>void;onChanged:()=>void;onDelete:()=>void}){
  const status=effectiveStatus(project,now),overdue=isOverdue(project,now),variance=deliveryVariance(project),group=groups.find(item=>item.id===project.groupId)
  const [editing,setEditing]=useState(false)
  const finish=async()=>{if(confirm(`结束项目“${project.name}”？\n\n时间表会立即以当前时间截断项目占用。`)){await window.eazyflow.updateProject(project.id,{status:'已完成',completedAt:new Date().toISOString()});await onChanged()}}
  return <div className="project-page"><header className="project-top"><button className="back" onClick={onBack}><ChevronLeft/>{backLabel}</button><div className="project-actions">{status!=='已完成'&&<button className="finish-button" onClick={finish}><CheckCircle2/>结束项目</button>}<details className="more-menu"><summary className="ghost"><MoreHorizontal/></summary><div className="menu-popover"><button onClick={()=>setEditing(true)}><Edit3/>项目编辑</button><button className="menu-delete" onClick={onDelete}><Trash2/>删除项目</button></div></details></div></header><section className={`project-hero ${status==='已完成'?'completed-hero':''} ${overdue?'overdue-hero':''} ${group?'continued-hero':''}`}><div className="project-title"><i style={{background:overdue?'#d0444f':project.color}}/><div><p className="eyebrow">项目工作区</p><h1>{status==='已完成'?'✓ ':overdue?'! ':''}{project.name}</h1>{group&&<button className="project-relation" onClick={()=>onOpenGroup(group)}><Link2/>查看项目组“{group.name}”</button>}<p>{project.description||'暂无项目说明'}</p>{project.supportTarget&&<p className="project-support-target"><b>支撑对象</b><span className="support-target-pill">{project.supportTarget}</span></p>}</div></div><div className="project-meta"><div><span>状态</span><b className={`status ${overdue?'overdue-status':''}`}>{overdue?'已逾期':status}</b></div><div><span>开始时间</span><b>{format(parseISO(project.startAt),'yyyy年M月d日 HH:mm')}</b></div><div><span>计划交付</span><b>{project.dueAt?format(parseISO(project.dueAt),'yyyy年M月d日 HH:mm'):'未设置'}</b></div><div><span>结束时间</span><b>{project.completedAt?format(parseISO(project.completedAt),'yyyy年M月d日 HH:mm'):'尚未结束'}</b>{variance&&<em className={variance.startsWith('逾期')?'late-variance':'early-variance'}>{variance}</em>}</div></div></section><ProjectFiles project={project} onChanged={onChanged}/>{editing&&<ProjectEditor project={project} projects={projects} groups={groups} supportTargets={supportTargets} createSupportTarget={createSupportTarget} onClose={()=>setEditing(false)} onSave={async patch=>{await window.eazyflow.updateProject(project.id,patch);setEditing(false);await onChanged()}}/>}</div>
}

function ProjectGroupPage({group,projects,groups,now,onBack,onOpen,onChanged}:{group:ProjectGroup;projects:Project[];groups:ProjectGroup[];now:Date;onBack:()=>void;onOpen:(project:Project)=>void;onChanged:()=>void}){
  const [editing,setEditing]=useState(false),members=projects.filter(project=>project.groupId===group.id).sort((a,b)=>parseISO(b.startAt).getTime()-parseISO(a.startAt).getTime())
  return <div className="project-page group-page"><header className="project-top"><button className="back" onClick={onBack}><ChevronLeft/>返回项目库</button><button className="secondary" onClick={()=>setEditing(true)}><Edit3/>编辑关联组</button></header><section className="group-hero" style={{'--group':group.color} as React.CSSProperties}><div className="group-hero-icon"><Layers/></div><div><p className="eyebrow">关联项目组</p><h1>{group.name}</h1><p>{group.description||'用于汇总同属一项大型工作的项目，成员之间不预设先后关系。'}</p></div><dl><div><dt>项目数量</dt><dd>{members.length}</dd></div><div><dt>已完成</dt><dd>{members.filter(project=>project.status==='已完成').length}</dd></div></dl></section><section className="group-members-panel"><header><div><p className="eyebrow">组内项目</p><h2>项目成员</h2></div><span>按开始时间排列，仅用于浏览，不表示递进关系</span></header><div className="group-members-grid">{members.map(project=>{const status=effectiveStatus(project,now);return <button className={isOverdue(project,now)?'late':''} key={project.id} onDoubleClick={()=>onOpen(project)} onClick={()=>onOpen(project)}><i style={{background:project.color}}/><ProjectTag compact/><h3>{project.name}</h3>{project.supportTarget&&<p className="support-target">支撑对象：{project.supportTarget}</p>}<p>{format(parseISO(project.startAt),'yyyy/M/d HH:mm')}</p><span>{isOverdue(project,now)?'已逾期':status}</span></button>})}</div></section>{editing&&<GroupEditor group={group} groups={groups} onClose={()=>setEditing(false)} onSave={async patch=>{await window.eazyflow.updateGroup(group.id,patch);setEditing(false);await onChanged()}}/>}</div>
}

function GroupEditor({group,groups,onClose,onSave}:{group:ProjectGroup;groups:ProjectGroup[];onClose:()=>void;onSave:(patch:Partial<ProjectGroup>)=>void}){
  const [name,setName]=useState(group.name),[description,setDescription]=useState(group.description),[color,setColor]=useState(group.color),[recommendation]=useState(()=>randomColor(groups.map(item=>item.color)))
  return <div className="modal-backdrop"><form className="modal" onSubmit={e=>{e.preventDefault();if(name.trim())onSave({name:name.trim(),description:description.trim(),color})}}><div className="modal-head"><div><p className="eyebrow">关联项目组</p><h2>编辑关联组</h2></div><button type="button" onClick={onClose}><X/></button></div><label>关联组名称<input autoFocus value={name} onChange={e=>setName(e.currentTarget.value)}/></label><label>关联组说明<textarea value={description} onChange={e=>setDescription(e.currentTarget.value)} placeholder="记录这组项目共同对应的大型工作"/></label><label>识别颜色<ColorPicker value={color} recommendation={recommendation} onChange={setColor}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!name.trim()}>保存更改</button></div></form></div>
}

function ProjectFiles({project,onChanged}:{project:Project;onChanged:()=>void}){
  const [active,setActive]=useState<FileCategory>('task'),[notice,setNotice]=useState('')
  const category=categories.find(c=>c.id===active)!,files=project.files.filter(f=>f.category===active)
  const run=async(action:()=>Promise<unknown>)=>{try{await action();await onChanged()}catch(error){alert(error instanceof Error?error.message:'操作失败')}}
  return <section className="materials-workspace"><div className="material-tabs" role="tablist" aria-label="项目文件分类">{categories.map(c=>{const Icon=c.icon,count=project.files.filter(f=>f.category===c.id).length;return <button key={c.id} id={`project-file-tab-${c.id}`} type="button" role="tab" aria-controls={`project-files-${project.id}`} aria-selected={active===c.id} className={active===c.id?'active':''} onClick={()=>setActive(c.id)}><Icon/><span>{c.label}</span><em>{count}</em></button>})}</div><FileSection key={category.id} projectId={project.id} category={category} files={files} notice={notice} onNotice={setNotice} onChanged={onChanged} onImport={destination=>run(()=>window.eazyflow.importFiles(project.id,category.id,destination))} onImportFolder={destination=>run(()=>window.eazyflow.importFolder(project.id,category.id,destination))} onDrop={(dropped,destination)=>run(()=>window.eazyflow.importDroppedFiles(project.id,category.id,dropped,destination))} onPaste={(pasted,destination)=>run(()=>window.eazyflow.importClipboardFiles(project.id,category.id,pasted,destination))} onRename={(f,name)=>run(()=>window.eazyflow.renameFile(project.id,f.id,name))} onOpen={f=>window.eazyflow.openFile(project.id,f.id).then(onChanged).catch(error=>alert(error.message))} onReveal={f=>window.eazyflow.revealFile(project.id,f.id).then(onChanged).catch(error=>alert(error.message))} onDelete={async f=>{if(confirm(`确定删除“${f.name}”吗？\n\n${f.kind==='folder'?'整个文件夹及其内容':'文件'}会移入 Windows 回收站。`))await run(()=>window.eazyflow.deleteFile(project.id,f.id))}}/></section>
}

const imageExtensions=new Set(['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg'])
function FileSection({projectId,category,files,notice,onNotice,onChanged,onImport,onImportFolder,onDrop,onPaste,onRename,onOpen,onReveal,onDelete}:{projectId:string;category:typeof categories[number];files:ProjectFile[];notice:string;onNotice:(value:string)=>void;onChanged:()=>void;onImport:(destination:string)=>void;onImportFolder:(destination:string)=>void;onDrop:(files:File[],destination:string)=>void;onPaste:(files:File[],destination:string)=>void;onRename:(f:ProjectFile,name:string)=>void;onOpen:(f:ProjectFile)=>void;onReveal:(f:ProjectFile)=>void;onDelete:(f:ProjectFile)=>void}){
  const Icon=category.icon
  const [dragging,setDragging]=useState(false),[selectedId,setSelectedId]=useState<string|null>(null),[renamingId,setRenamingId]=useState<string|null>(null),[currentPath,setCurrentPath]=useState(''),[nestedFiles,setNestedFiles]=useState<ProjectFile[]>([]),[creatingFolder,setCreatingFolder]=useState(false),[folderName,setFolderName]=useState(''),[selectionMode,setSelectionMode]=useState(false),[selectedKeys,setSelectedKeys]=useState<string[]>([])
  const displayed=currentPath?nestedFiles:files,images=displayed.filter(f=>f.kind!=='folder'&&imageExtensions.has(f.extension.toLowerCase())),documents=displayed.filter(f=>f.kind==='folder'||!imageExtensions.has(f.extension.toLowerCase()))
  const keyFor=(file:ProjectFile)=>file.relativePath?`path:${file.relativePath}`:`id:${file.id}`
  const selectedEntries=displayed.filter(file=>selectedKeys.includes(keyFor(file))),selectedZips=selectedEntries.filter(file=>file.kind==='file'&&file.extension.toLowerCase()==='.zip')
  const refs=selectedEntries.map(file=>({id:file.id,...(file.relativePath?{relativePath:file.relativePath}:{})}))
  const loadFolder=async(path=currentPath)=>{if(path)setNestedFiles(await window.eazyflow.listFolder(projectId,category.id,path))}
  useEffect(()=>{if(currentPath)loadFolder(currentPath).catch(error=>alert(error.message))},[currentPath,files])
  useEffect(()=>{setSelectedKeys([]);setSelectedId(null)},[currentPath])
  useEffect(()=>{
    const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.matches('input, textarea, select')||target.isContentEditable||Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
    const paste=(event:ClipboardEvent)=>{if(editable(event.target))return;const pasted=Array.from(event.clipboardData?.files||[]);if(pasted.length){event.preventDefault();onPaste(pasted,currentPath)}}
    const copy=(event:KeyboardEvent)=>{if(editable(event.target)||event.isComposing||!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='c')return;if(selectionMode&&selectedEntries.length){event.preventDefault();void copySelected()}else{const selected=displayed.find(file=>file.id===selectedId);if(selected){event.preventDefault();copyEntry(selected)}}}
    window.addEventListener('paste',paste);window.addEventListener('keydown',copy);return()=>{window.removeEventListener('paste',paste);window.removeEventListener('keydown',copy)}
  },[currentPath,displayed,onPaste,selectedId,selectedEntries,selectionMode])
  useEffect(()=>{if(selectedId&&!displayed.some(file=>file.id===selectedId))setSelectedId(null);setSelectedKeys(keys=>keys.filter(key=>displayed.some(file=>keyFor(file)===key)))},[displayed,selectedId])
  const refresh=async()=>{await onChanged();if(currentPath)await loadFolder()}
  const showNotice=(message:string)=>{onNotice(message);window.setTimeout(()=>onNotice(''),3800)}
  const copyEntry=async(f:ProjectFile)=>{try{if(!f.relativePath){const name=await window.eazyflow.copyFile(projectId,f.id);showNotice(`已复制“${name}”，可在资源管理器中按 Ctrl+V 粘贴`)}else{const names=await window.eazyflow.copyEntries(projectId,category.id,[{id:f.id,relativePath:f.relativePath}]);showNotice(`已复制“${names[0]}”，可在资源管理器中按 Ctrl+V 粘贴`)}}catch(error){alert(error instanceof Error?error.message:'复制失败')}}
  const copySelected=async()=>{if(!refs.length)return;try{const names=await window.eazyflow.copyEntries(projectId,category.id,refs);showNotice(`已复制 ${names.length} 项，可在资源管理器中按 Ctrl+V 粘贴`)}catch(error){alert(error instanceof Error?error.message:'复制失败')}}
  const deleteSelected=async()=>{if(!refs.length||!confirm(`确定删除选中的 ${refs.length} 项吗？\n\n文件和文件夹会移入 Windows 回收站。`))return;try{await window.eazyflow.deleteEntries(projectId,category.id,refs);setSelectedKeys([]);await refresh()}catch(error){alert(error instanceof Error?error.message:'批量删除失败')}}
  const extractSelected=async()=>{if(!selectedZips.length)return;try{const names=await window.eazyflow.extractZipFiles(projectId,category.id,selectedZips.map(file=>({id:file.id,...(file.relativePath?{relativePath:file.relativePath}:{})})));setSelectedKeys([]);await refresh();showNotice(`已解压：${names.join('、')}`)}catch(error){alert(error instanceof Error?error.message:'解压失败')}}
  const toggleEntry=(file:ProjectFile)=>{const key=keyFor(file);setSelectedKeys(keys=>keys.includes(key)?keys.filter(item=>item!==key):[...keys,key])}
  const toggleAll=()=>setSelectedKeys(selectedEntries.length===displayed.length?[]:displayed.map(keyFor))
  const handleEntryClick=(event:React.MouseEvent,file:ProjectFile)=>{event.stopPropagation();if((event.target as HTMLElement).closest('.file-select-checkbox'))return;if(selectionMode)toggleEntry(file);else setSelectedId(file.id)}
  const renameEntry=async(f:ProjectFile,name:string)=>{setRenamingId(null);if(!name.trim()||name.trim()===f.name)return;if(!f.relativePath)return onRename(f,name.trim());try{await window.eazyflow.renameFolderEntry(projectId,category.id,f.relativePath,name.trim());await refresh()}catch(error){alert(error instanceof Error?error.message:'重命名失败')}}
  const deleteEntry=async(f:ProjectFile)=>{if(!f.relativePath)return onDelete(f);if(!confirm(`确定删除“${f.name}”吗？\n\n内容会移入 Windows 回收站。`))return;try{await window.eazyflow.deleteFolderEntry(projectId,category.id,f.relativePath);await refresh()}catch(error){alert(error instanceof Error?error.message:'删除失败')}}
  const openEntry=(f:ProjectFile)=>{if(f.kind==='folder'){setCurrentPath(f.relativePath||f.storedName||f.name);setSelectedId(null);return}if(f.relativePath)window.eazyflow.openFolderEntry(projectId,category.id,f.relativePath).catch(error=>alert(error.message));else if(imageExtensions.has(f.extension.toLowerCase()))window.eazyflow.previewFile(projectId,f.id).catch(error=>alert(error.message));else onOpen(f)}
  const revealEntry=(f:ProjectFile)=>f.relativePath?window.eazyflow.revealFolderEntry(projectId,category.id,f.relativePath).catch(error=>alert(error.message)):onReveal(f)
  const createFolder=async()=>{if(!folderName.trim())return;try{await window.eazyflow.createFolder(projectId,category.id,currentPath,folderName.trim());setFolderName('');setCreatingFolder(false);await refresh()}catch(error){alert(error instanceof Error?error.message:'无法创建文件夹')}}
  const crumbs=currentPath.split('/').filter(Boolean)
  const fileName=(f:ProjectFile)=>renamingId===f.id?<RenameInput file={f} onSave={name=>renameEntry(f,name)} onCancel={()=>setRenamingId(null)}/>:<b>{f.name}</b>
  return <section id={`project-files-${projectId}`} role="tabpanel" aria-labelledby={`project-file-tab-${category.id}`} className={`file-section material-panel ${dragging?'dragging':''}`} onClick={()=>setSelectedId(null)} onDragEnter={e=>{e.preventDefault();setDragging(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}} onDrop={e=>{e.preventDefault();setDragging(false);const dropped=Array.from(e.dataTransfer.files);if(dropped.length)onDrop(dropped,currentPath)}}>
    <header className="file-content-toolbar">
      <div className="file-location">{currentPath&&<nav className="folder-breadcrumb" aria-label="当前文件夹路径"><button type="button" onClick={()=>setCurrentPath('')}>{category.label}</button>{crumbs.map((crumb,index)=><span key={index}><ChevronRight/><button type="button" aria-current={index===crumbs.length-1?'location':undefined} onClick={()=>setCurrentPath(crumbs.slice(0,index+1).join('/'))}>{crumb}</button></span>)}</nav>}</div>
      <div className="file-toolbar"><button className={`secondary selection-mode-toggle ${selectionMode?'active':''}`} onClick={e=>{e.stopPropagation();setSelectionMode(value=>!value);if(selectionMode)setSelectedKeys([])}}>{selectionMode?'完成选择':'多选'}</button><button className="secondary" onClick={e=>{e.stopPropagation();setCreatingFolder(true)}}><FolderPlus/>新建文件夹</button><button className="secondary" onClick={e=>{e.stopPropagation();onImportFolder(currentPath)}}><FolderOpen/>导入文件夹</button><button className="primary" onClick={e=>{e.stopPropagation();onImport(currentPath)}}><Upload/>添加文件</button></div>
    </header>
    {selectionMode&&<div className="bulk-selection-toolbar"><span>已选 <b>{selectedEntries.length}</b> 项</span><button className="secondary" onClick={toggleAll} disabled={!displayed.length}>{selectedEntries.length===displayed.length?'取消全选':'全选当前文件夹'}</button><button className="secondary" onClick={()=>void copySelected()} disabled={!selectedEntries.length}><Copy/>复制</button>{selectedZips.length>0&&<button className="secondary" onClick={()=>void extractSelected()}><FolderOpen/>解压 ZIP（{selectedZips.length}）</button>}<button className="danger-button" onClick={()=>void deleteSelected()} disabled={!selectedEntries.length}><Trash2/>删除</button></div>}
    {creatingFolder&&<div className="new-folder-row"><FolderOpen/><input autoFocus value={folderName} onChange={e=>setFolderName(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();createFolder()}if(e.key==='Escape'){setCreatingFolder(false);setFolderName('')}}} placeholder="输入文件夹名称"/><button className="primary" onClick={createFolder}>创建</button><button className="secondary" onClick={()=>{setCreatingFolder(false);setFolderName('')}}>取消</button></div>}
    {notice&&<p className="copy-notice">{notice}</p>}
    {displayed.length===0?<div className="file-empty"><Icon/><h3>{currentPath?'这个文件夹是空的':'还没有添加内容'}</h3></div>:<div className="file-content">
      {images.length>0&&<div className="image-gallery">{images.map(f=><article className={`image-card ${selectedId===f.id||selectedKeys.includes(keyFor(f))?'selected-file':''} ${selectionMode?'selection-active':''}`} key={f.id} onClick={e=>handleEntryClick(e,f)} onDoubleClick={e=>{if(!selectionMode&&renamingId!==f.id)openEntry(f)}} title={selectionMode?'勾选需要批量处理的文件':'单击选中，双击打开'}>
        {selectionMode&&<input className="file-select-checkbox" type="checkbox" checked={selectedKeys.includes(keyFor(f))} onClick={e=>e.stopPropagation()} onChange={()=>toggleEntry(f)} aria-label={`选择 ${f.name}`}/>}
        {f.relativePath?<div className="file-type image-file-type">{f.extension.replace('.','').slice(0,4)}</div>:<img src={window.eazyflow.filePreviewUrl(projectId,f.id)} alt={f.name}/>}
        <div className="image-caption"><span>{fileName(f)}<small>{bytes(f.size)}</small></span>{!selectionMode&&<FileActions file={f} onRename={()=>setRenamingId(f.id)} onCopy={copyEntry} onOpen={openEntry} onReveal={revealEntry} onDelete={deleteEntry}/>}</div>
      </article>)}</div>}
      {documents.length>0&&<div className="file-list document-list">{documents.map(f=><div className={`file-row ${f.kind==='folder'?'folder-row':''} ${selectedId===f.id||selectedKeys.includes(keyFor(f))?'selected-file':''}`} key={f.id} onClick={e=>handleEntryClick(e,f)} onDoubleClick={e=>{if(!selectionMode&&renamingId!==f.id)openEntry(f)}} title={selectionMode?'勾选需要批量处理的文件':f.kind==='folder'?'双击在软件内进入文件夹':'双击打开文件'}>
        {selectionMode&&<input className="file-select-checkbox" type="checkbox" checked={selectedKeys.includes(keyFor(f))} onClick={e=>e.stopPropagation()} onChange={()=>toggleEntry(f)} aria-label={`选择 ${f.name}`}/>}
        <div className="file-type">{f.kind==='folder'?<FolderOpen/>:f.extension.replace('.','').slice(0,4)||'FILE'}</div><div className="file-info">{fileName(f)}<small>{f.kind==='folder'?'文件夹 · 双击进入':`${bytes(f.size)} · 双击打开`}</small></div>
        {!selectionMode&&<FileActions file={f} onRename={()=>setRenamingId(f.id)} onCopy={copyEntry} onOpen={openEntry} onReveal={revealEntry} onDelete={deleteEntry}/>}
      </div>)}</div>}
    </div>}
  </section>
}

function RenameInput({file,onSave,onCancel}:{file:ProjectFile;onSave:(name:string)=>void;onCancel:()=>void}){
  const [name,setName]=useState(file.name),done=useRef(false),finish=()=>{if(done.current)return;done.current=true;onSave(name)}
  useEffect(()=>()=>{done.current=true},[])
  return <input className="file-rename-input" autoFocus value={name} onClick={e=>e.stopPropagation()} onChange={e=>setName(e.currentTarget.value)} onBlur={finish} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();finish()}else if(e.key==='Escape'){done.current=true;onCancel()}}}/>
}

function FileActions({file,onRename,onCopy,onOpen,onReveal,onDelete}:{file:ProjectFile;onRename:()=>void;onCopy:(file:ProjectFile)=>void;onOpen:(file:ProjectFile)=>void;onReveal:(file:ProjectFile)=>void;onDelete:(file:ProjectFile)=>void}){
  return <div className="file-actions" onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}><button title="重命名" onClick={onRename}><Edit3/></button><button title="复制到应用外" onClick={()=>onCopy(file)}><Copy/></button><button title="打开" onClick={()=>onOpen(file)}><ExternalLink/></button><button title="在资源管理器中定位" onClick={()=>onReveal(file)}><FolderOpen/></button><button className="file-delete" title="删除" onClick={()=>onDelete(file)}><Trash2/></button></div>
}

function AssociationPicker({groups,projects,value,onChange,excludeProjectId}:{groups:ProjectGroup[];projects:Project[];value:string;onChange:(value:string)=>void;excludeProjectId?:string}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState('')
  const [placement,setPlacement]=useState<{top:number;left:number;width:number;maxHeight:number}|null>(null)
  const pickerRef=useRef<HTMLDivElement>(null),triggerRef=useRef<HTMLButtonElement>(null),popoverRef=useRef<HTMLDivElement>(null)
  const needle=query.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
  const membersOf=(group:ProjectGroup)=>projects.filter(project=>project.groupId===group.id)
  const selectedGroup=value.startsWith('group:')?groups.find(group=>`group:${group.id}`===value):undefined
  const availableGroups=groups.filter(group=>`${group.name} ${group.description} ${membersOf(group).map(project=>`${project.name} ${project.description} ${project.supportTarget||''}`).join(' ')}`.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(needle))
  const availableProjects=projects.filter(project=>project.id!==excludeProjectId&&!project.groupId&&`${project.name} ${project.description} ${project.supportTarget||''}`.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(needle))
  const title=value==='new'?'新建关联组':value.startsWith('group:')?(groups.find(group=>`group:${group.id}`===value)?.name||'选择的关联组'):value.startsWith('project:')?(projects.find(project=>`project:${project.id}`===value)?.name||'选择项目'):''
  const summary=value==='new'?'之后为这组项目命名':value.startsWith('group:')?selectedGroup?`${membersOf(selectedGroup).length} 个项目已在此组`:'关联组已不存在，请重新选择':value.startsWith('project:')?'首次关联时会建立新组':'项目将独立管理'
  const choose=(next:string)=>{onChange(next);setOpen(false);setQuery('')}
  useEffect(()=>{
    if(!open)return
    const updatePlacement=()=>{
      const rect=triggerRef.current?.getBoundingClientRect()
      if(!rect)return
      const maxHeight=Math.min(320,window.innerHeight-24),width=Math.min(rect.width,window.innerWidth-24)
      const left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),below=window.innerHeight-rect.bottom
      const top=below>=maxHeight+12?rect.bottom+6:Math.max(12,rect.top-maxHeight-6)
      setPlacement({top,left,width,maxHeight})
    }
    const close=(event:PointerEvent)=>{const target=event.target as Node;if(!pickerRef.current?.contains(target)&&!popoverRef.current?.contains(target))setOpen(false)}
    updatePlacement();window.addEventListener('resize',updatePlacement);window.addEventListener('scroll',updatePlacement,true);window.addEventListener('pointerdown',close)
    return()=>{window.removeEventListener('resize',updatePlacement);window.removeEventListener('scroll',updatePlacement,true);window.removeEventListener('pointerdown',close)}
  },[open])
  return <div className={`relation-picker ${open?'open':''}`} ref={pickerRef} onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);setQuery('')}}}>
    <button ref={triggerRef} type="button" className="relation-picker-trigger" aria-expanded={open} onClick={()=>{setPlacement(null);setOpen(value=>!value)}}><span><b>{title||'不加入关联组'}</b><small>{summary}</small></span><ChevronRight className={open?'turned':''}/></button>
    {open&&placement&&createPortal(<div ref={popoverRef} className="relation-picker-popover" style={placement}><label className="relation-picker-search"><Search/><input autoFocus value={query} onChange={event=>setQuery(event.currentTarget.value)} placeholder="搜索组名、项目名或对象"/></label><div className="relation-picker-options" role="listbox" aria-label="关联项目选择">
      <button type="button" role="option" aria-selected={value===''} onClick={()=>choose('')}><span><b>不加入关联组</b><small>项目将独立管理</small></span></button>
      <button type="button" role="option" aria-selected={value==='new'} onClick={()=>choose('new')}><span><b>新建关联组</b><small>为一组相关项目建立新的归集</small></span><Plus/></button>
      {availableGroups.length>0&&<strong>现有关联组</strong>}{availableGroups.map(group=>{const members=membersOf(group),memberNames=members.slice(0,3).map(project=>project.name).join('、'),detail=members.length?`${memberNames}${members.length>3?` 等 ${members.length} 个项目`:''}${group.description?` · ${group.description}`:''}`:group.description||'尚无成员项目';return <button type="button" role="option" aria-selected={value===`group:${group.id}`} key={group.id} onClick={()=>choose(`group:${group.id}`)}><span><b>{group.name}</b><small>{detail}</small></span><em>{members.length}</em></button>})}
      {availableProjects.length>0&&<strong>与未分组项目建立关联</strong>}{availableProjects.map(project=><button type="button" role="option" aria-selected={value===`project:${project.id}`} key={project.id} onClick={()=>choose(`project:${project.id}`)}><span><b>{project.name}</b><small>{project.supportTarget?`支撑对象：${project.supportTarget} · `:''}{project.description||'新建关联组后一起归集'}</small></span><Link2/></button>)}
      {!availableGroups.length&&!availableProjects.length&&needle&&<small className="relation-picker-empty">没有匹配的组或未分组项目</small>}
    </div></div>,document.body)}
  </div>
}

function CreateProject({projects,groups,supportTargets,createSupportTarget,onClose,onCreated}:{projects:Project[];groups:ProjectGroup[];supportTargets:SupportTarget[];createSupportTarget:(name:string)=>Promise<SupportTarget>;onClose:()=>void;onCreated:(p:Project)=>void}){
  const [name,setName]=useState(''),[description,setDescription]=useState(''),[supportTargetId,setSupportTargetId]=useState(''),[start,setStart]=useState(toLocalInput(new Date().toISOString())),[due,setDue]=useState(''),[association,setAssociation]=useState(''),[groupName,setGroupName]=useState(''),[projectColor]=useState(()=>randomColor(projects.map(project=>project.color))),[groupColorRecommendation]=useState(()=>randomColor(groups.map(group=>group.color))),[groupColor,setGroupColor]=useState(groupColorRecommendation),[color,setColor]=useState(projectColor),[saving,setSaving]=useState(false)
  const needsGroup=association==='new'||association.startsWith('project:'),valid=Boolean(name.trim()&&start&&(!due||new Date(due)>new Date(start))&&(!needsGroup||groupName.trim()))
  const chooseAssociation=(value:string)=>{setAssociation(value);if(value.startsWith('project:')&&!groupName){const related=projects.find(project=>`project:${project.id}`===value);if(related)setGroupName(`${related.name} 关联组`)}}
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!valid)return;setSaving(true);try{const associationPatch=association.startsWith('group:')?{targetGroupId:association.slice(6)}:association.startsWith('project:')?{relatedProjectId:association.slice(8),groupName:groupName.trim(),groupColor}:association==='new'?{groupName:groupName.trim(),groupColor}:{};const supportTarget=supportTargets.find(target=>target.id===supportTargetId);const p=await window.eazyflow.createProject({name:name.trim(),description:description.trim(),supportTargetId,supportTarget:supportTarget?.name||'',color,status:'进行中',startAt:new Date(start).toISOString(),...(due?{dueAt:new Date(due).toISOString()}:{}),...associationPatch});onCreated(p)}finally{setSaving(false)}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><p className="eyebrow">创建工作空间</p><h2>新建项目</h2></div><button type="button" onClick={onClose}><X/></button></div>
    <label>项目名称<input autoFocus value={name} onChange={e=>setName(e.currentTarget.value)} placeholder="例如：品牌视觉提案"/></label>
    <label>项目说明<textarea value={description} onChange={e=>setDescription(e.currentTarget.value)} placeholder="简单记录任务目标或背景（选填）"/></label>
    <SupportTargetPicker targets={supportTargets} value={supportTargetId} onChange={setSupportTargetId} onCreate={createSupportTarget}/>
    <div className="form-row"><label>开始时间<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>计划交付时间（可选）<input type="datetime-local" value={due} min={start} onChange={e=>setDue(e.target.value)}/></label></div>
    <div className="relation-field"><span><Link2/>关联项目（可选）</span><AssociationPicker groups={groups} projects={projects} value={association} onChange={chooseAssociation}/><small>搜索关联组或项目，可查看组内成员和项目背景后再选择。</small></div>
    {needsGroup&&<div className="group-create-fields"><label>关联组名称<input value={groupName} onChange={e=>setGroupName(e.currentTarget.value)} placeholder="为这项大型工作命名"/></label><label>关联组颜色<ColorPicker value={groupColor} recommendation={groupColorRecommendation} onChange={setGroupColor}/></label></div>}
    <label>识别颜色<ColorPicker value={color} recommendation={projectColor} onChange={setColor}/></label>{due&&new Date(due)<=new Date(start)&&<p className="error">交付时间需要晚于开始时间</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!valid||saving}>{saving?'创建中…':'创建项目'}</button></div>
  </form></div>
}

function ProjectEditor({project,projects,groups,supportTargets,createSupportTarget,onClose,onSave:saveProject}:{project:Project;projects:Project[];groups:ProjectGroup[];supportTargets:SupportTarget[];createSupportTarget:(name:string)=>Promise<SupportTarget>;onClose:()=>void;onSave:(patch:Partial<Project>&{relatedProjectId?:string;targetGroupId?:string;groupName?:string;groupColor?:string;clearGroup?:boolean})=>void|Promise<void>}){
  const [name,setName]=useState(project.name),[description,setDescription]=useState(project.description),[supportTargetId,setSupportTargetId]=useState(project.supportTargetId||supportTargets.find(target=>target.name===project.supportTarget)?.id||''),[start,setStart]=useState(toLocalInput(project.startAt)),[due,setDue]=useState(toLocalInput(project.dueAt)),[completed,setCompleted]=useState(toLocalInput(project.completedAt)),[association,setAssociation]=useState(project.groupId?`group:${project.groupId}`:''),[groupName,setGroupName]=useState(''),[groupColorRecommendation]=useState(()=>randomColor(groups.map(group=>group.color))),[groupColor,setGroupColor]=useState(groupColorRecommendation),[color,setColor]=useState(project.color),[colorRecommendation]=useState(()=>randomColor(projects.map(item=>item.color))),[status,setStatus]=useState<ProjectStatus>(project.status)
  const [saving,setSaving]=useState(false)
  const onSave=async(patch:Partial<Project>&{relatedProjectId?:string;targetGroupId?:string;groupName?:string;groupColor?:string;clearGroup?:boolean})=>{if(saving)return;setSaving(true);try{await saveProject(patch)}catch(error){alert(error instanceof Error?`保存失败：${error.message}`:'保存失败，请重试')}finally{setSaving(false)}}
  const needsGroup=association==='new'||association.startsWith('project:'),valid=Boolean(name.trim()&&start&&(!due||new Date(due)>new Date(start))&&(!completed||new Date(completed)>=new Date(start))&&(!needsGroup||groupName.trim()))
  const changeStatus=(next:ProjectStatus)=>{setStatus(next);if(next==='已完成'&&!completed)setCompleted(toLocalInput(new Date().toISOString()));if(next==='进行中')setCompleted('')}
  const changeCompleted=(value:string)=>{setCompleted(value);setStatus(value?'已完成':'进行中')}
  const chooseAssociation=(value:string)=>{setAssociation(value);if(value.startsWith('project:')&&!groupName){const related=projects.find(item=>`project:${item.id}`===value);if(related)setGroupName(`${related.name} 关联组`)}}
  const associationPatch=association.startsWith('group:')?{targetGroupId:association.slice(6)}:association.startsWith('project:')?{relatedProjectId:association.slice(8),groupName:groupName.trim(),groupColor}:association==='new'?{groupName:groupName.trim(),groupColor}:project.groupId?{clearGroup:true}:{}
  return <div className="modal-backdrop"><form className="modal editor-modal" onSubmit={e=>{e.preventDefault();if(!valid)return;const supportTarget=supportTargets.find(target=>target.id===supportTargetId);onSave({name:name.trim(),description:description.trim(),supportTargetId,supportTarget:supportTarget?.name||'',startAt:new Date(start).toISOString(),dueAt:due?new Date(due).toISOString():undefined,...associationPatch,color,status:completed?'已完成':status,completedAt:completed?new Date(completed).toISOString():undefined})}}>
    <div className="modal-head"><div><p className="eyebrow">项目信息</p><h2>项目编辑</h2></div><button type="button" onClick={onClose}><X/></button></div>
    <label>项目名称<input autoFocus value={name} onChange={e=>setName(e.currentTarget.value)}/></label><label>项目说明<textarea value={description} onChange={e=>setDescription(e.currentTarget.value)}/></label>
    <SupportTargetPicker targets={supportTargets} value={supportTargetId} onChange={setSupportTargetId} onCreate={createSupportTarget}/>
    <div className="form-row"><label>开始时间<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>计划交付时间<input type="datetime-local" value={due} min={start} onChange={e=>setDue(e.target.value)}/></label></div>
    <div className="relation-field"><span><Link2/>关联项目（可选）</span><AssociationPicker groups={groups} projects={projects} excludeProjectId={project.id} value={association} onChange={chooseAssociation}/><small>列表会显示关联组成员和项目背景，可搜索后直接选择。</small></div>
    {needsGroup&&<div className="group-create-fields"><label>关联组名称<input value={groupName} onChange={e=>setGroupName(e.currentTarget.value)} placeholder="为这项大型工作命名"/></label><label>关联组颜色<ColorPicker value={groupColor} recommendation={groupColorRecommendation} onChange={setGroupColor}/></label></div>}
    <div className="form-row"><label>结束时间<input type="datetime-local" value={completed} min={start} onChange={e=>changeCompleted(e.target.value)}/><small className="field-help">修改后会立即改变气泡终点</small></label><label>项目状态<select value={status} onChange={e=>changeStatus(e.target.value as ProjectStatus)}><option value="进行中">进行中</option><option value="已完成">已完成</option></select><small className="field-help">清空结束时间即可恢复为进行中</small></label></div>
    <label>识别颜色<ColorPicker value={color} recommendation={colorRecommendation} onChange={setColor}/></label>{completed&&new Date(completed)<new Date(start)&&<p className="error">结束时间不能早于开始时间</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!valid||saving}>{saving?'保存中…':'保存更改'}</button></div>
  </form></div>
}

function ScheduleModal({value,onSave,onClose,required=false}:{value:WorkSettings;onSave:(s:WorkSettings)=>void;onClose?:()=>void;required?:boolean}){
  const [form,setForm]=useState(value),valid=form.startHour<form.breakStart&&form.breakStart<form.breakEnd&&form.breakEnd<=form.endHour
  const field=(key:'startHour'|'endHour'|'breakStart'|'breakEnd')=><input type="time" step="1800" value={hourText(form[key])} onChange={e=>{const [h,m]=e.target.value.split(':').map(Number);setForm({...form,[key]:h+m/60})}}/>
  const presets:{name:WorkSettings['weekPreset'];days:number[]}[]=[{name:'双休',days:[1,2,3,4,5]},{name:'单休',days:[1,2,3,4,5,6]},{name:'大小周',days:[1,2,3,4,5]},{name:'自定义',days:form.workDays}]
  const choose=(name:WorkSettings['weekPreset'],days:number[])=>setForm({...form,weekPreset:name,workDays:days})
  return <div className="modal-backdrop"><form className="modal schedule-modal" onSubmit={e=>{e.preventDefault();if(valid)onSave(form)}}><div className="modal-head"><div><p className="eyebrow">排期基础</p><h2>{required?'先设置你的工作日历':'工作日历设置'}</h2></div>{!required&&<button type="button" onClick={onClose}><X/></button>}</div><p className="modal-intro">工作日历会直接参与排期：项目跳过休息、请假和调休日，并在加班日继续延伸。单日例外可在月历日期上右键设置。</p><h3 className="settings-title">每日时间</h3><div className="form-row"><label>上班时间{field('startHour')}</label><label>下班时间{field('endHour')}</label></div><div className="form-row"><label>休息开始{field('breakStart')}</label><label>休息结束{field('breakEnd')}</label></div><h3 className="settings-title">每周工作日</h3><div className="preset-row">{presets.map(p=><button type="button" key={p.name} className={form.weekPreset===p.name?'active':''} onClick={()=>choose(p.name,p.days)}>{p.name}</button>)}</div>{form.weekPreset==='大小周'&&<label className="check-row"><input type="checkbox" checked={form.bigWeekStartsThisWeek} onChange={e=>setForm({...form,bigWeekStartsThisWeek:e.target.checked})}/><span>本周为大周（周六上班）</span></label>}{form.weekPreset==='自定义'&&<div className="weekday-row">{['日','一','二','三','四','五','六'].map((d,i)=><button type="button" key={d} className={form.workDays.includes(i)?'active':''} onClick={()=>setForm({...form,workDays:form.workDays.includes(i)?form.workDays.filter(x=>x!==i):[...form.workDays,i]})}>周{d}</button>)}</div>}<h3 className="settings-title">例外规则</h3><label className="check-row"><input type="checkbox" checked={form.publicHolidays} onChange={e=>setForm({...form,publicHolidays:e.target.checked})}/><span><b>自动计算中国法定节假日</b><small>使用随应用更新的离线节假日数据</small></span></label><label className="check-row nested"><input type="checkbox" disabled={!form.publicHolidays} checked={form.makeupWorkdays} onChange={e=>setForm({...form,makeupWorkdays:e.target.checked})}/><span>同时识别法定调休工作日</span></label><label className="check-row"><input type="checkbox" checked={form.irregularRest} onChange={e=>setForm({...form,irregularRest:e.target.checked})}/><span><b>不定期休息</b><small>把下面日期作为额外休息日</small></span></label>{form.irregularRest&&<label>额外休息日期 <small>以逗号分隔</small><input value={form.restDates.join(', ')} placeholder="2026-08-21, 2026-09-03" onChange={e=>setForm({...form,restDates:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/></label>}{!valid&&<p className="error">休息时间需要位于上班和下班时间之间</p>}<div className="modal-actions">{!required&&<button type="button" className="secondary" onClick={onClose}>取消</button>}<button className="primary" disabled={!valid}>保存工作日历</button></div></form></div>
}

function ColorPicker({value,recommendation,onChange}:{value:string;recommendation:string;onChange:(color:string)=>void}){
  return <div className="color-row expanded"><button type="button" className={`recommended-color ${value===recommendation?'picked':''}`} style={{background:recommendation}} onClick={()=>onChange(recommendation)} title="随机生成的推荐颜色"><span>推荐</span></button>{colors.map(color=><button type="button" className={value===color?'picked':''} style={{background:color}} key={color} onClick={()=>onChange(color)}/>)}<span className="custom-color"><input type="color" value={value} onChange={e=>onChange(e.target.value)}/><em>自定义</em></span></div>
}

function ContextMenu({x,y,project,onOpen,onDelete}:{x:number;y:number;project:Project;onOpen:()=>void;onDelete:()=>void}){return <div className="context-menu" style={{left:Math.min(x,window.innerWidth-190),top:Math.min(y,window.innerHeight-110)}} onClick={e=>e.stopPropagation()}><button onClick={onOpen}><FolderOpen/>打开项目</button><button className="menu-delete" onClick={onDelete}><Trash2/>删除项目</button></div>}
function DayContextMenu({x,y,date,current,onChoose}:{x:number;y:number;date:Date;current?:DayOverride;onChoose:(value?:DayOverride)=>void}){return <div className="context-menu day-context-menu" style={{left:Math.min(x,window.innerWidth-220),top:Math.min(y,window.innerHeight-230)}} onClick={e=>e.stopPropagation()}><header><b>{format(date,'M月d日 EEEE',{locale:zhCN})}</b><small>设置后立即重新计算项目排期</small></header><button className={current==='leave'?'selected':''} onClick={()=>onChoose('leave')}><i className="override-dot leave"/><span>请假<small>当天不安排项目</small></span></button><button className={current==='timeoff'?'selected':''} onClick={()=>onChoose('timeoff')}><i className="override-dot timeoff"/><span>调休<small>当天不安排项目</small></span></button><button className={current==='overtime'?'selected':''} onClick={()=>onChoose('overtime')}><i className="override-dot overtime"/><span>加班<small>作为工作日延伸项目</small></span></button>{current&&<button className="clear-override" onClick={()=>onChoose()}><X/>恢复默认日历</button>}</div>}
function ProjectTag({compact=false,attached=false}:{compact?:boolean;attached?:boolean}){return <span className={`project-tag continuation-tag ${compact?'compact':''} ${attached?'attached':''}`} title="属于关联项目组"><Layers/><span>关联组</span></span>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><CalendarDays/><h3>{title}</h3><p>{text}</p></div>}
export default App
