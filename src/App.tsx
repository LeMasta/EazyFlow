import { useEffect, useRef, useState } from 'react'
import { addDays, addMonths, differenceInCalendarWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isWithinInterval, parseISO, startOfDay, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Copy, Edit3, ExternalLink, File as FileIcon, FileCheck2, FileInput, FolderOpen, LayoutGrid, Library, Link2, Maximize2, MoreHorizontal, Plus, RefreshCw, RotateCcw, RotateCw, Search, Settings2, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react'
import { getFestival, isAdditionalWorkday } from 'chinese-workday'
import type { DayOverride, DisplayStatus, FileCategory, Project, ProjectFile, ProjectStatus, WorkSettings } from './types'

const categories: { id: FileCategory; label: string; hint: string; icon: typeof FileIcon }[] = [
  { id: 'task', label: '任务文件', hint: '需求、原始素材与任务说明', icon: FileInput },
  { id: 'reference', label: '参考文件', hint: '灵感、范例与背景资料', icon: FolderOpen },
  { id: 'delivery', label: '交付文件', hint: '最终版本与交付记录', icon: FileCheck2 },
  { id: 'other', label: '其他', hint: '过程稿和暂未归类的内容', icon: FileIcon }
]
const colors = ['#7557d9','#9b59b6','#5c6ac4','#477fbd','#3b9fd4','#36a9a1','#4c9b86','#66a84f','#94a83d','#b38a36','#d4a72c','#e18b57','#df704d','#d45f70','#c94f8a','#8d6e63','#657079','#343a40']
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
const hourText = (n:number) => {
  const hour=Math.floor(n),minute=Math.round((n-hour)*60)
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
}
const defaultSchedule:WorkSettings={startHour:9,endHour:18,breakStart:12,breakEnd:13,weekPreset:'双休',workDays:[1,2,3,4,5],bigWeekStartsThisWeek:true,publicHolidays:true,makeupWorkdays:true,irregularRest:false,restDates:[],dayOverrides:{},recentProjectDays:3}
const projectEnd=(p:Project,now=new Date())=>p.completedAt?parseISO(p.completedAt):p.dueAt&&parseISO(p.dueAt)>now?parseISO(p.dueAt):now
const predecessorOptions=(projects:Project[],start:string,editingId?:string)=>{
  const blocked=new Set(editingId?[editingId]:[]),startTime=new Date(start).getTime()
  if(editingId){let changed=true;while(changed){changed=false;for(const p of projects)if(p.predecessorId&&blocked.has(p.predecessorId)&&!blocked.has(p.id)){blocked.add(p.id);changed=true}}}
  return projects.filter(p=>!blocked.has(p.id)&&parseISO(p.startAt).getTime()<startTime).sort((a,b)=>parseISO(b.startAt).getTime()-parseISO(a.startAt).getTime())
}
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
  const [settings,setSettings]=useState<WorkSettings|null|undefined>()
  const [storageRoot,setStorageRoot]=useState('')
  const [appVersion,setAppVersion]=useState('')
  const [page,setPage]=useState<'timeline'|'library'|'settings'>('timeline')
  const [view,setView]=useState<'hour'|'month'>('hour')
  const [cursor,setCursor]=useState(new Date())
  const [activeId,setActiveId]=useState<string|null>(null)
  const [creating,setCreating]=useState(false)
  const [scheduleOpen,setScheduleOpen]=useState(false)
  const [search,setSearch]=useState('')
  const [update,setUpdate]=useState('')
  const [context,setContext]=useState<{x:number;y:number;project:Project}|null>(null)
  const [dayContext,setDayContext]=useState<{x:number;y:number;date:Date}|null>(null)
  const [now,setNow]=useState(new Date())
  const load=async()=>{const s=await window.eazyflow.getSnapshot();setProjects(s.projects);setSettings(s.settings);setStorageRoot(s.storageRoot)}
  useEffect(()=>{load();const sync=()=>load();window.addEventListener('focus',sync);window.eazyflow.getAppVersion().then(setAppVersion).catch(()=>{});const unsubscribe=window.eazyflow.onUpdateStatus(setUpdate);return()=>{window.removeEventListener('focus',sync);unsubscribe()}},[])
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),30000);return()=>window.clearInterval(timer)},[])
  useEffect(()=>{const close=()=>{setContext(null);setDayContext(null)};window.addEventListener('click',close);return()=>window.removeEventListener('click',close)},[])
  const active=projects.find(p=>p.id===activeId)
  const visible=projects.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()))
  const recentProjects=projects.filter(p=>!settings?.recentProjectDays||new Date(p.lastOpenedAt||p.createdAt).getTime()>=now.getTime()-settings.recentProjectDays*86400000).sort((a,b)=>new Date(b.lastOpenedAt||b.createdAt).getTime()-new Date(a.lastOpenedAt||a.createdAt).getTime())
  const openProject=async(p:Project)=>{setActiveId(p.id);setContext(null);try{await window.eazyflow.touchProject(p.id);await load()}catch{/* 项目详情仍可打开 */}}
  const remove=async(p:Project)=>{
    if(!confirm(`删除项目“${p.name}”？\n\n项目文件夹会移入 Windows 回收站，项目记录将从 EazyFlow 中移除。`))return
    await window.eazyflow.deleteProject(p.id);if(activeId===p.id)setActiveId(null);setContext(null);await load()
  }
  const showContext=(e:React.MouseEvent,p:Project)=>{e.preventDefault();setContext({x:e.clientX,y:e.clientY,project:p})}
  const setDayOverride=async(date:Date,value?:DayOverride)=>{if(!settings)return;const key=dateKey(date),next={...settings.dayOverrides};if(value)next[key]=value;else delete next[key];const updated={...settings,dayOverrides:next};await window.eazyflow.updateSettings(updated);setSettings(updated);setDayContext(null)}
  return <div className="app-shell">
    <div className="window-drag-region" aria-hidden="true"/>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">E</span><span>EazyFlow</span></div>
      <button className="primary wide" onClick={()=>setCreating(true)}><Plus/>新建项目</button>
      <nav><button className={!active&&page==='timeline'?'selected':''} onClick={()=>{setActiveId(null);setPage('timeline')}}><CalendarDays/>时间表</button><button className={!active&&page==='library'?'selected':''} onClick={()=>{setActiveId(null);setPage('library')}}><Library/>项目库</button><div className="nav-caption">最近 {settings?.recentProjectDays?`${settings.recentProjectDays} 天`:'全部'}</div><div className="recent-projects">{recentProjects.map(p=><button key={p.id} className={active?.id===p.id?'selected':''} onClick={()=>openProject(p)}><i style={{background:p.color}}/>{p.name}</button>)}{recentProjects.length===0&&<small>暂无最近访问项目</small>}</div></nav>
      <div className="sidebar-bottom"><button className={!active&&page==='settings'?'selected':''} onClick={()=>{setActiveId(null);setPage('settings')}}><Settings2/>设置</button></div>
    </aside>
    <main>{active?<ProjectPage project={active} projects={projects} now={now} backLabel={page==='library'?'返回项目库':page==='settings'?'返回设置':'返回时间表'} onBack={()=>setActiveId(null)} onOpen={openProject} onChanged={load} onDelete={()=>remove(active)}/>:page==='settings'&&settings?<SettingsPage storageRoot={storageRoot} settings={settings} update={update} appVersion={appVersion} onSettingsChanged={async next=>{await window.eazyflow.updateSettings(next);setSettings(next)}} onStorageChanged={load}/>:page==='library'?<ProjectLibrary projects={projects} now={now} onOpen={openProject}/>:<>
      <header className="topbar"><div className="date-title"><p className="eyebrow">工作概览</p><div><h1>{view==='hour'?format(cursor,'M月d日 EEEE',{locale:zhCN}):format(cursor,'yyyy年 M月',{locale:zhCN})}</h1><div className="date-nav"><button onClick={()=>setCursor(view==='hour'?addDays(cursor,-1):subMonths(cursor,1))}><ChevronLeft/></button><button className="today" onClick={()=>setCursor(new Date())}>今天</button><button onClick={()=>setCursor(view==='hour'?addDays(cursor,1):addMonths(cursor,1))}><ChevronRight/></button></div></div></div><div className="top-actions"><div className="segmented view-switch"><button className={view==='hour'?'active':''} onClick={()=>setView('hour')}><Clock3/>小时表</button><button className={view==='month'?'active':''} onClick={()=>setView('month')}><LayoutGrid/>月历</button></div><button className="schedule-button" onClick={()=>setScheduleOpen(true)}><Settings2/>工作日历</button><div className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索项目"/></div></div></header>
      {settings&&(view==='hour'?<HourView date={cursor} now={now} projects={visible} settings={settings} onOpen={openProject} onContext={showContext}/>:<MonthView month={cursor} now={now} projects={visible} settings={settings} onOpen={openProject} onOpenDay={date=>{setCursor(date);setView('hour')}} onContext={showContext} onDateContext={(e,date)=>{e.preventDefault();setDayContext({x:e.clientX,y:e.clientY,date})}}/>)}
    </>}</main>
    {creating&&<CreateProject projects={projects} onClose={()=>setCreating(false)} onCreated={p=>{setProjects(x=>[...x,p]);setCreating(false)}}/>}
    {settings===null&&<ScheduleModal required value={defaultSchedule} onSave={async s=>{await window.eazyflow.updateSettings(s);setSettings(s)}}/>}
    {scheduleOpen&&settings&&<ScheduleModal value={settings} onClose={()=>setScheduleOpen(false)} onSave={async s=>{await window.eazyflow.updateSettings(s);setSettings(s);setScheduleOpen(false)}}/>}
    {context&&<ContextMenu {...context} onOpen={()=>openProject(context.project)} onDelete={()=>remove(context.project)}/>}
    {dayContext&&settings&&<DayContextMenu {...dayContext} current={settings.dayOverrides?.[dateKey(dayContext.date)]} onChoose={value=>setDayOverride(dayContext.date,value)}/>}
  </div>
}

function SettingsPage({storageRoot,settings,update,appVersion,onSettingsChanged,onStorageChanged}:{storageRoot:string;settings:WorkSettings;update:string;appVersion:string;onSettingsChanged:(settings:WorkSettings)=>void;onStorageChanged:()=>void}){
  const changeStorage=async()=>{try{const next=await window.eazyflow.selectStorageRoot();if(next)await onStorageChanged()}catch(error){alert(error instanceof Error?error.message:'无法更改存储位置')}}
  return <div className="settings-page"><header className="settings-header"><p className="eyebrow">EazyFlow</p><h1>设置</h1><p>管理项目文件、最近项目和软件更新。</p></header><section className="settings-card"><div className="settings-card-icon"><FolderOpen/></div><div className="settings-card-body"><h2>项目文件存储</h2><p>项目目录以项目名命名，仅在实际存入内容时创建对应的分类子文件夹。</p><div className="storage-path" title={storageRoot}>{storageRoot}</div><small>更改位置时，现有项目会先完整复制到新位置，再切换数据库记录；原目录随后移入回收站。</small></div><div className="settings-card-actions"><button className="secondary" onClick={()=>window.eazyflow.revealStorageRoot()}><ExternalLink/>打开位置</button><button className="primary" onClick={changeStorage}>更改位置</button></div></section><section className="settings-card"><div className="settings-card-icon"><Clock3/></div><div className="settings-card-body"><h2>最近项目</h2><p>侧栏显示最近访问过的项目。</p><label className="inline-setting">显示范围<select value={settings.recentProjectDays} onChange={e=>onSettingsChanged({...settings,recentProjectDays:Number(e.target.value)})}><option value={1}>最近 1 天</option><option value={3}>最近 3 天</option><option value={7}>最近 7 天</option><option value={14}>最近 14 天</option><option value={30}>最近 30 天</option><option value={0}>全部项目</option></select></label></div></section><section className="settings-card"><div className="settings-card-icon"><RefreshCw/></div><div className="settings-card-body"><h2>软件更新</h2><div className="current-version"><span>当前版本</span><b>v{appVersion||'—'}</b></div><p>{update||'可在这里检查 GitHub Releases 中的新版本。'}</p></div><div className="settings-card-actions">{update.includes('已下载')&&<button className="primary" onClick={()=>window.eazyflow.installUpdate()}>安装更新</button>}<button className="secondary" onClick={()=>window.eazyflow.checkForUpdates()}><RefreshCw/>检查更新</button></div></section></div>
}

function ProjectLibrary({projects,now,onOpen}:{projects:Project[];now:Date;onOpen:(project:Project)=>void}){
  const [query,setQuery]=useState(''),[status,setStatus]=useState<'all'|'active'|'completed'|'overdue'|'upcoming'>('all'),[due,setDue]=useState<'all'|'dated'|'undated'>('all'),[sort,setSort]=useState<'start-desc'|'start-asc'|'created-desc'|'due-asc'|'name'>('start-desc')
  const shown=projects.filter(p=>{
    const display=effectiveStatus(p,now)
    return p.name.toLowerCase().includes(query.trim().toLowerCase())&&(status==='all'||status==='active'&&display==='进行中'&&!isOverdue(p,now)||status==='completed'&&display==='已完成'||status==='overdue'&&isOverdue(p,now)||status==='upcoming'&&display==='未开始')&&(due==='all'||due==='dated'&&Boolean(p.dueAt)||due==='undated'&&!p.dueAt)
  }).sort((a,b)=>sort==='start-desc'?parseISO(b.startAt).getTime()-parseISO(a.startAt).getTime():sort==='start-asc'?parseISO(a.startAt).getTime()-parseISO(b.startAt).getTime():sort==='created-desc'?parseISO(b.createdAt).getTime()-parseISO(a.createdAt).getTime():sort==='due-asc'?(a.dueAt?parseISO(a.dueAt).getTime():Number.MAX_SAFE_INTEGER)-(b.dueAt?parseISO(b.dueAt).getTime():Number.MAX_SAFE_INTEGER):a.name.localeCompare(b.name,'zh-CN'))
  return <div className="library-page"><header className="library-header"><div><p className="eyebrow">全部工作</p><h1>项目库</h1><p>共 {projects.length} 个项目，双击项目进入详情。</p></div><div className="library-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索项目名称"/></div></header><section className="library-filters"><label>状态<select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="all">全部状态</option><option value="active">进行中</option><option value="upcoming">未开始</option><option value="overdue">已逾期</option><option value="completed">已完成</option></select></label><label>交付时间<select value={due} onChange={e=>setDue(e.target.value as typeof due)}><option value="all">全部项目</option><option value="dated">已设交付</option><option value="undated">未定交付</option></select></label><label>排序<select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="start-desc">开始时间：新到旧</option><option value="start-asc">开始时间：旧到新</option><option value="created-desc">创建时间：新到旧</option><option value="due-asc">交付时间：近到远</option><option value="name">项目名称</option></select></label><span>{shown.length} 个结果</span></section>{shown.length?<section className="project-library-list">{shown.map(p=>{const display=effectiveStatus(p,now),overdue=isOverdue(p,now),predecessor=projects.find(item=>item.id===p.predecessorId);return <article key={p.id} className={`library-project ${overdue?'overdue-library':''} ${predecessor?'continued-project':''}`} onDoubleClick={()=>onOpen(p)} title="双击进入项目详情"><i style={{background:overdue?'#d0444f':p.color}}/><div className="library-project-main"><h3>{p.name}</h3><p>{predecessor&&<span className="relation-inline"><Link2/>延续自 {predecessor.name}</span>}{p.description||'暂无项目说明'}</p></div><div><span>开始</span><b>{format(parseISO(p.startAt),'yyyy/M/d HH:mm')}</b></div><div><span>计划交付</span><b>{p.dueAt?format(parseISO(p.dueAt),'yyyy/M/d HH:mm'):'未设置'}</b></div><div><span>结束时间</span><b>{p.completedAt?format(parseISO(p.completedAt),'yyyy/M/d HH:mm'):'尚未结束'}</b></div><em className={`library-status ${overdue?'late':''}`}>{overdue?'已逾期':display}</em></article>})}</section>:<Empty title="没有符合条件的项目" text="尝试调整搜索、状态或交付时间筛选。"/>}</div>
}

function HourView({date,now,projects,settings,onOpen,onContext}:{date:Date;now:Date;projects:Project[];settings:WorkSettings;onOpen:(p:Project)=>void;onContext:(e:React.MouseEvent,p:Project)=>void}){
  const [zoom,setZoom]=useState(88),start=startOfDay(date),end=endOfDay(date)
  const working=isWorkingDate(date,settings)
  const shown=working?projects.filter(p=>parseISO(p.startAt)<=end&&projectEnd(p,now)>=start):[]
  const hours=Array.from({length:settings.endHour-settings.startHour+1},(_,i)=>settings.startHour+i),width=(settings.endHour-settings.startHour)*zoom
  return <section className={`hour-card horizontal-hour ${working?'':'nonworking-view'}`}><div className="zoom-bar"><span>{working?'工作日':`休息日${settings.publicHolidays&&getFestival(dateKey(date))?` · ${getFestival(dateKey(date))}`:''}`} · {hourText(settings.startHour)}—{hourText(settings.endHour)} · 休息 {hourText(settings.breakStart)}—{hourText(settings.breakEnd)}</span><div><button onClick={()=>setZoom(z=>Math.max(52,z-12))}><ZoomOut/></button><b>{Math.round(zoom/88*100)}%</b><button onClick={()=>setZoom(z=>Math.min(160,z+12))}><ZoomIn/></button></div></div>{shown.length===0?<Empty title={working?'这一天没有安排':'这是休息日'} text={working?'新建项目，或切换到其他日期查看。':'项目会跳过这一天；如需工作，请在月历中右键标记为加班。'}/>:<div className="horizontal-scroll"><div className="horizontal-table" style={{width:width+210}}><div className="hour-axis-label">项目</div><div className="hour-axis" style={{width}}>{hours.map(h=><span key={h} style={{left:(h-settings.startHour)*zoom}}>{hourText(h)}</span>)}</div>{shown.map(p=><HourRow key={p.id} project={p} date={date} now={now} settings={settings} zoom={zoom} timelineWidth={width} onOpen={()=>onOpen(p)} onContext={e=>onContext(e,p)}/>)}</div></div>}</section>
}

function HourRow({project,date,now,settings,zoom,timelineWidth,onOpen,onContext}:{project:Project;date:Date;now:Date;settings:WorkSettings;zoom:number;timelineWidth:number;onOpen:()=>void;onContext:(e:React.MouseEvent)=>void}){
  const start=parseISO(project.startAt),due=project.dueAt?parseISO(project.dueAt):null,completed=project.status==='已完成',overdue=isOverdue(project,now),followsNow=!completed&&(!due||now>due),actualEnd=completed&&project.completedAt?parseISO(project.completedAt):followsNow?now:due
  const rawStart=isSameDay(start,date)?start.getHours()+start.getMinutes()/60:settings.startHour
  const rawEnd=actualEnd&&isSameDay(actualEnd,date)?actualEnd.getHours()+actualEnd.getMinutes()/60:settings.endHour
  const a=Math.max(settings.startHour,Math.min(settings.endHour,rawStart)),b=Math.max(a+.15,Math.min(settings.endHour,rawEnd))
  const showNow=isSameDay(now,date)&&now.getHours()+now.getMinutes()/60>=settings.startHour&&now.getHours()+now.getMinutes()/60<=settings.endHour
  return <div className={`horizontal-row ${completed?'completed-row':''} ${overdue?'overdue-row':''} ${project.predecessorId?'continued-row':''}`} onContextMenu={onContext}><button className="row-project" onDoubleClick={onOpen}><i style={{background:completed?'#7b9a82':overdue?'#d0444f':project.color}}/><span><b>{project.name}</b><small>{project.predecessorId?'↳ 延续项目 · ':''}{completed?'✓ 已完成':overdue?'! 已逾期':effectiveStatus(project,now)}</small></span></button><div className="row-timeline" style={{width:timelineWidth,backgroundSize:`${zoom}px 100%`}}><div className="break-band" style={{left:(settings.breakStart-settings.startHour)*zoom,width:(settings.breakEnd-settings.breakStart)*zoom}}/><button className={`horizontal-bubble ${followsNow?'open-ended':''} ${completed?'completed-bubble':''} ${overdue?'overdue-bubble':''} ${project.predecessorId?'continued-bubble':''}`} style={{left:(a-settings.startHour)*zoom,width:Math.max(34,(b-a)*zoom),'--bubble':project.color} as React.CSSProperties} onDoubleClick={onOpen} title={`${project.name}\n${project.predecessorId?'延续项目\n':''}${format(start,'M月d日 HH:mm')} 开始\n${completed&&project.completedAt?'实际结束 '+format(parseISO(project.completedAt),'M月d日 HH:mm'):overdue&&due?'已超过计划交付 '+format(due,'M月d日 HH:mm'):due?format(due,'M月d日 HH:mm')+' 计划交付':'结束时间未定'}\n双击进入，右键管理`}><b>{project.predecessorId?'↳ ':''}{completed?'✓ ':overdue?'! ':''}{project.name}</b><small>{hourText(a)}—{hourText(b)}{followsNow?' · 随当前时间推进':''}</small></button>{showNow&&!completed&&<div className="now-line" style={{left:(now.getHours()+now.getMinutes()/60-settings.startHour)*zoom}}/>}</div></div>
}

function MonthView({month,now,projects,settings,onOpen,onOpenDay,onContext,onDateContext}:{month:Date;now:Date;projects:Project[];settings:WorkSettings;onOpen:(p:Project)=>void;onOpenDay:(date:Date)=>void;onContext:(e:React.MouseEvent,p:Project)=>void;onDateContext:(e:React.MouseEvent,date:Date)=>void}){
  const start=startOfWeek(startOfMonth(month),{weekStartsOn:1}),end=endOfWeek(endOfMonth(month),{weekStartsOn:1}),days=eachDayOfInterval({start,end})
  const onDay=(p:Project,d:Date)=>{
    if(!isWorkingDate(d,settings))return false
    const projectStart=startOfDay(parseISO(p.startAt)),projectFinish=endOfDay(projectEnd(p,now))
    return projectStart<=projectFinish&&isWithinInterval(d,{start:projectStart,end:projectFinish})
  }
  return <section className="month-card"><div className="weekdays">{'一二三四五六日'.split('').map(d=><span key={d}>周{d}</span>)}</div><div className="month-grid">{days.map(day=>{const all=projects.filter(p=>onDay(p,day)),working=isWorkingDate(day,settings),festival=settings.publicHolidays?getFestival(dateKey(day)):'',override=settings.dayOverrides?.[dateKey(day)];return <div onDoubleClick={()=>onOpenDay(day)} onContextMenu={e=>onDateContext(e,day)} className={`day ${!isSameMonth(day,month)?'muted':''} ${isSameDay(day,now)?'today-day':''} ${working?'':'rest-day'} ${override?`override-${override}`:''}`} key={dateKey(day)} title="双击查看当天小时表"><span className="day-num">{format(day,'d')}</span><small className="day-kind">{override==='leave'?'请假':override==='timeoff'?'调休':override==='overtime'?'加班':festival|| (working?'工作日':'休息')}</small><div className="day-items">{all.map(p=>{const begins=isSameDay(day,parseISO(p.startAt)),completed=p.status==='已完成',overdue=isOverdue(p,now),afterDue=overdue&&p.dueAt&&day>=startOfDay(parseISO(p.dueAt)),last=isSameDay(day,projectEnd(p,now));return <button key={p.id} onDoubleClick={e=>{e.stopPropagation();onOpen(p)}} onContextMenu={e=>{e.stopPropagation();onContext(e,p)}} className={`month-pill ${!p.dueAt?'undated':''} ${completed?'completed-pill':''} ${afterDue?'overdue-pill':''} ${p.predecessorId?'continued-pill':''}`} style={{'--bubble':p.color} as React.CSSProperties} title={`${p.name}\n${p.predecessorId?'延续自关联项目\n':''}${p.description}\n${completed&&p.completedAt?'实际结束 '+format(parseISO(p.completedAt),'M月d日 HH:mm'):overdue&&p.dueAt?'已超过计划交付 '+format(parseISO(p.dueAt),'M月d日 HH:mm'):p.dueAt?'计划交付 '+format(parseISO(p.dueAt),'M月d日 HH:mm'):'结束时间未定'}`}><span>{p.predecessorId?'↳ ':''}{completed&&last?'✓ ':afterDue?'! ':''}{begins?p.name:`↪ ${p.name}`}</span>{afterDue?<em>逾期</em>:!p.dueAt&&!completed?<em>{last?'今日延伸':'持续中'}</em>:p.predecessorId&&begins?<em>延续</em>:null}</button>})}</div></div>})}</div></section>
}

function ProjectPage({project,projects,now,backLabel,onBack,onOpen,onChanged,onDelete}:{project:Project;projects:Project[];now:Date;backLabel:string;onBack:()=>void;onOpen:(project:Project)=>void;onChanged:()=>void;onDelete:()=>void}){
  const status=effectiveStatus(project,now),overdue=isOverdue(project,now),variance=deliveryVariance(project),predecessor=projects.find(p=>p.id===project.predecessorId)
  const [editing,setEditing]=useState(false)
  const finish=async()=>{if(confirm(`结束项目“${project.name}”？\n\n时间表会立即以当前时间截断项目占用。`)){await window.eazyflow.updateProject(project.id,{status:'已完成',completedAt:new Date().toISOString()});await onChanged()}}
  return <div className="project-page"><header className="project-top"><button className="back" onClick={onBack}><ChevronLeft/>{backLabel}</button><div className="project-actions">{status!=='已完成'&&<button className="finish-button" onClick={finish}><CheckCircle2/>结束项目</button>}<details className="more-menu"><summary className="ghost"><MoreHorizontal/></summary><div className="menu-popover"><button onClick={()=>setEditing(true)}><Edit3/>项目编辑</button><button className="menu-delete" onClick={onDelete}><Trash2/>删除项目</button></div></details></div></header><section className={`project-hero ${status==='已完成'?'completed-hero':''} ${overdue?'overdue-hero':''} ${predecessor?'continued-hero':''}`}><div className="project-title"><i style={{background:overdue?'#d0444f':project.color}}/><div><p className="eyebrow">项目工作区</p><h1>{status==='已完成'?'✓ ':overdue?'! ':''}{project.name}</h1>{predecessor&&<button className="project-relation" onClick={()=>onOpen(predecessor)}><Link2/>延续自“{predecessor.name}”</button>}<p>{project.description||'暂无项目说明'}</p></div></div><div className="project-meta"><div><span>状态</span><b className={`status ${overdue?'overdue-status':''}`}>{overdue?'已逾期':status}</b></div><div><span>开始时间</span><b>{format(parseISO(project.startAt),'yyyy年M月d日 HH:mm')}</b></div><div><span>计划交付</span><b>{project.dueAt?format(parseISO(project.dueAt),'yyyy年M月d日 HH:mm'):'未设置'}</b></div><div><span>结束时间</span><b>{project.completedAt?format(parseISO(project.completedAt),'yyyy年M月d日 HH:mm'):'尚未结束'}</b>{variance&&<em className={variance.startsWith('逾期')?'late-variance':'early-variance'}>{variance}</em>}</div></div></section><ProjectFiles project={project} onChanged={onChanged}/>{editing&&<ProjectEditor project={project} projects={projects} onClose={()=>setEditing(false)} onSave={async patch=>{await window.eazyflow.updateProject(project.id,patch);setEditing(false);await onChanged()}}/>}</div>
}

function ProjectFiles({project,onChanged}:{project:Project;onChanged:()=>void}){
  const [active,setActive]=useState<FileCategory>('task')
  const [notice,setNotice]=useState('')
  const category=categories.find(c=>c.id===active)!
  const files=project.files.filter(f=>f.category===active)
  const run=async(action:()=>Promise<unknown>)=>{try{await action();await onChanged()}catch(error){alert(error instanceof Error?error.message:'操作失败')}}
  const copy=async(f:ProjectFile)=>{try{const name=await window.eazyflow.copyFile(project.id,f.id);setNotice(`已复制“${name}”，可在资源管理器中按 Ctrl+V 粘贴`);window.setTimeout(()=>setNotice(''),3500)}catch(error){alert(error instanceof Error?error.message:'复制失败')}}
  return <section className="materials-workspace"><div className="material-tabs">{categories.map(c=>{const Icon=c.icon,count=project.files.filter(f=>f.category===c.id).length;return <button key={c.id} className={active===c.id?'active':''} onClick={()=>setActive(c.id)}><Icon/><span>{c.label}</span><em>{count}</em></button>})}</div><FileSection projectId={project.id} category={category} files={files} notice={notice} onImport={()=>run(()=>window.eazyflow.importFiles(project.id,category.id))} onImportFolder={()=>run(()=>window.eazyflow.importFolder(project.id,category.id))} onDrop={dropped=>run(()=>window.eazyflow.importDroppedFiles(project.id,category.id,dropped))} onPaste={pasted=>run(()=>window.eazyflow.importClipboardFiles(project.id,category.id,pasted))} onCopy={copy} onRename={(f,name)=>run(()=>window.eazyflow.renameFile(project.id,f.id,name))} onOpen={f=>window.eazyflow.openFile(project.id,f.id).then(onChanged).catch(error=>alert(error.message))} onReveal={f=>window.eazyflow.revealFile(project.id,f.id).then(onChanged).catch(error=>alert(error.message))} onDelete={async f=>{if(confirm(`确定删除“${f.name}”吗？\n\n${f.kind==='folder'?'整个文件夹及其内容':'文件'}会移入 Windows 回收站。`))await run(()=>window.eazyflow.deleteFile(project.id,f.id))}}/></section>
}

const imageExtensions=new Set(['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg'])
function FileSection({projectId,category,files,notice,onImport,onImportFolder,onDrop,onPaste,onCopy,onRename,onOpen,onReveal,onDelete}:{projectId:string;category:typeof categories[number];files:ProjectFile[];notice:string;onImport:()=>void;onImportFolder:()=>void;onDrop:(files:File[])=>void;onPaste:(files:File[])=>void;onCopy:(f:ProjectFile)=>void;onRename:(f:ProjectFile,name:string)=>void;onOpen:(f:ProjectFile)=>void;onReveal:(f:ProjectFile)=>void;onDelete:(f:ProjectFile)=>void}){
  const Icon=category.icon,[dragging,setDragging]=useState(false),[selectedId,setSelectedId]=useState<string|null>(null),[renamingId,setRenamingId]=useState<string|null>(null),[previewId,setPreviewId]=useState<string|null>(null),images=files.filter(f=>f.kind!=='folder'&&imageExtensions.has(f.extension.toLowerCase())),documents=files.filter(f=>f.kind==='folder'||!imageExtensions.has(f.extension.toLowerCase())),preview=images.find(f=>f.id===previewId)
  useEffect(()=>{
    const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.matches('input, textarea, select, [contenteditable="true"]')||Boolean(target.closest('[contenteditable="true"]')))
    const paste=(event:ClipboardEvent)=>{if(editable(event.target))return;const pasted=Array.from(event.clipboardData?.files||[]);if(pasted.length){event.preventDefault();onPaste(pasted)}}
    const copy=(event:KeyboardEvent)=>{if(editable(event.target)||!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='c')return;const selected=files.find(file=>file.id===selectedId);if(selected){event.preventDefault();onCopy(selected)}}
    window.addEventListener('paste',paste);window.addEventListener('keydown',copy)
    return()=>{window.removeEventListener('paste',paste);window.removeEventListener('keydown',copy)}
  },[files,onCopy,onPaste,selectedId])
  useEffect(()=>{if(selectedId&&!files.some(file=>file.id===selectedId))setSelectedId(null)},[files,selectedId])
  const choose=(event:React.MouseEvent,f:ProjectFile)=>{event.stopPropagation();setSelectedId(f.id)}
  const rename=(f:ProjectFile,name:string)=>{setRenamingId(null);if(name.trim()&&name.trim()!==f.name)onRename(f,name.trim())}
  const fileName=(f:ProjectFile)=>renamingId===f.id?<RenameInput file={f} onSave={name=>rename(f,name)} onCancel={()=>setRenamingId(null)}/>:<b>{f.name}</b>
  return <section className={`file-section material-panel ${dragging?'dragging':''}`} onClick={()=>setSelectedId(null)} onDragEnter={e=>{e.preventDefault();setDragging(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}} onDrop={e=>{e.preventDefault();setDragging(false);const dropped=Array.from(e.dataTransfer.files);if(dropped.length)onDrop(dropped)}}>
    <div className="file-heading"><div className="file-heading-icon"><Icon/></div><div><h3>{category.label}<span>{files.length}</span></h3><p>{category.hint}；图片可直接预览</p></div><div className="file-heading-actions"><button onClick={onImport}><Plus/>添加文件</button><button onClick={onImportFolder}><FolderOpen/>添加文件夹</button></div></div>
    {notice&&<div className="clipboard-notice"><CheckCircle2/>{notice}</div>}
    {files.length===0?<div className="drop-hint material-empty"><Upload/><b>{dragging?'松开即可复制到项目':'拖入或按 Ctrl+V 粘贴文件、文件夹和截图'}</b><span>也可以使用上方按钮选择，内容会完整复制一份保存在项目内</span></div>:<>
      <div className="compact-drop"><Upload/>可拖入或按 Ctrl+V 粘贴；单击选中后按 Ctrl+C 可复制到资源管理器</div>
      {images.length>0&&<div className="image-gallery">{images.map(f=><article className={`image-card ${selectedId===f.id?'selected-file':''}`} key={f.id} onClick={e=>choose(e,f)} onDoubleClick={()=>renamingId!==f.id&&setPreviewId(f.id)} title="单击选中，双击在 EazyFlow 内预览"><img src={window.eazyflow.filePreviewUrl(projectId,f.id)} alt={f.name}/><div className="image-caption"><span>{fileName(f)}<small>{bytes(f.size)}</small></span><FileActions file={f} onRename={()=>setRenamingId(f.id)} onCopy={onCopy} onOpen={onOpen} onReveal={onReveal} onDelete={onDelete}/></div></article>)}</div>}
      {documents.length>0&&<div className="file-list document-list">{documents.map(f=><div className={`file-row ${f.kind==='folder'?'folder-row':''} ${selectedId===f.id?'selected-file':''}`} key={f.id} onClick={e=>choose(e,f)} onDoubleClick={()=>renamingId!==f.id&&onOpen(f)} title={`单击选中，双击打开${f.kind==='folder'?'文件夹':'文件'}`}><div className="file-type">{f.kind==='folder'?<FolderOpen/>:f.extension.replace('.','').slice(0,4)||'FILE'}</div><div className="file-info">{fileName(f)}<small>{f.kind==='folder'?'文件夹 · 双击打开':`${bytes(f.size)} · 双击打开`}</small></div><FileActions file={f} onRename={()=>setRenamingId(f.id)} onCopy={onCopy} onOpen={onOpen} onReveal={onReveal} onDelete={onDelete}/></div>)}</div>}
    </>}
    {dragging&&<div className="drop-overlay"><Upload/>复制到“{category.label}”</div>}
    {preview&&<ImagePreview projectId={projectId} file={preview} onClose={()=>setPreviewId(null)} onOpen={()=>onOpen(preview)} onReveal={()=>onReveal(preview)}/>}
  </section>
}

function RenameInput({file,onSave,onCancel}:{file:ProjectFile;onSave:(name:string)=>void;onCancel:()=>void}){
  const [name,setName]=useState(file.name),done=useRef(false)
  const finish=()=>{if(done.current)return;done.current=true;onSave(name)}
  return <input className="file-rename-input" autoFocus value={name} onClick={e=>e.stopPropagation()} onChange={e=>setName(e.target.value)} onBlur={finish} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finish()}else if(e.key==='Escape'){done.current=true;onCancel()}}}/>
}

function FileActions({file,onRename,onCopy,onOpen,onReveal,onDelete}:{file:ProjectFile;onRename:()=>void;onCopy:(file:ProjectFile)=>void;onOpen:(file:ProjectFile)=>void;onReveal:(file:ProjectFile)=>void;onDelete:(file:ProjectFile)=>void}){
  return <div className="file-actions"><button title="重命名" onClick={e=>{e.stopPropagation();onRename()}}><Edit3/></button><button title="复制到剪贴板" onClick={e=>{e.stopPropagation();onCopy(file)}}><Copy/></button><button title={`打开${file.kind==='folder'?'文件夹':'文件'}`} onClick={e=>{e.stopPropagation();onOpen(file)}}><ExternalLink/></button><button title="打开所在位置" onClick={e=>{e.stopPropagation();onReveal(file)}}><FolderOpen/></button><button className="danger" title="移入回收站" onClick={e=>{e.stopPropagation();onDelete(file)}}><Trash2/></button></div>
}

function ImagePreview({projectId,file,onClose,onOpen,onReveal}:{projectId:string;file:ProjectFile;onClose:()=>void;onOpen:()=>void;onReveal:()=>void}){
  const [zoom,setZoom]=useState(1),[rotation,setRotation]=useState(0),[actual,setActual]=useState(false),[offset,setOffset]=useState({x:0,y:0}),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null)
  const changeZoom=(delta:number)=>setZoom(value=>Math.min(4,Math.max(.25,Number((value+delta).toFixed(2)))))
  const fit=()=>{setZoom(1);setRotation(0);setActual(false);setOffset({x:0,y:0})}
  const original=()=>{setZoom(1);setActual(true);setOffset({x:0,y:0})}
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();else if(event.key==='+'||event.key==='=')changeZoom(.25);else if(event.key==='-')changeZoom(-.25);else if(event.key==='0')fit()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[])
  return <div className="image-preview-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="image-preview-shell" role="dialog" aria-modal="true" aria-label={`预览 ${file.name}`}>
      <header><div><b>{file.name}</b><small>{bytes(file.size)} · 双击图片切换适应窗口 / 1:1</small></div><div className="preview-file-actions"><button onClick={onReveal}><FolderOpen/>定位文件</button><button onClick={onOpen}><ExternalLink/>系统打开</button><button className="preview-close" onClick={onClose}><X/></button></div></header>
      <div className="image-preview-toolbar"><button title="向左旋转" onClick={()=>setRotation(value=>value-90)}><RotateCcw/></button><button title="向右旋转" onClick={()=>setRotation(value=>value+90)}><RotateCw/></button><i/><button title="缩小" onClick={()=>changeZoom(-.25)}><ZoomOut/></button><b>{Math.round(zoom*100)}%</b><button title="放大" onClick={()=>changeZoom(.25)}><ZoomIn/></button><i/><button className={!actual?'active':''} onClick={fit}><Maximize2/>适应窗口</button><button className={actual?'active':''} onClick={original}>1:1</button></div>
      <div className="image-preview-stage"
        onWheel={e=>{e.preventDefault();changeZoom(e.deltaY<0 ? .25 : -.25)}}
        onDoubleClick={()=>{if(actual)fit();else original()}}
        onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,left:offset.x,top:offset.y}}}
        onPointerMove={e=>{if(drag.current)setOffset({x:drag.current.left+e.clientX-drag.current.x,y:drag.current.top+e.clientY-drag.current.y})}}
        onPointerUp={()=>{drag.current=null}}
        onPointerCancel={()=>{drag.current=null}}>
        <img className={actual?'actual-size':''} draggable={false} src={window.eazyflow.filePreviewUrl(projectId,file.id)} alt={file.name} style={{transform:`translate(${offset.x}px,${offset.y}px) rotate(${rotation}deg) scale(${zoom})`}}/>
      </div>
    </section>
  </div>
}

function CreateProject({projects,onClose,onCreated}:{projects:Project[];onClose:()=>void;onCreated:(p:Project)=>void}){
  const [name,setName]=useState(''),[description,setDescription]=useState(''),[start,setStart]=useState(toLocalInput(new Date().toISOString())),[due,setDue]=useState(''),[predecessorId,setPredecessorId]=useState(''),[color,setColor]=useState(colors[0]),[saving,setSaving]=useState(false)
  const relationOptions=predecessorOptions(projects,start)
  const valid=Boolean(name.trim()&&start&&(!due||new Date(due)>new Date(start)))
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!valid)return;setSaving(true);const p=await window.eazyflow.createProject({name:name.trim(),description:description.trim(),color,status:'进行中',startAt:new Date(start).toISOString(),...(due?{dueAt:new Date(due).toISOString()}:{}),...(predecessorId?{predecessorId}:{})});onCreated(p)}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">创建工作空间</p><h2>新建项目</h2></div><button type="button" onClick={onClose}><X/></button></div><label>项目名称<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="例如：品牌视觉提案"/></label><label>项目说明<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="简单记录任务目标或背景（选填）"/></label><div className="form-row"><label>开始时间<input type="datetime-local" value={start} onChange={e=>{setStart(e.target.value);if(predecessorId&&!predecessorOptions(projects,e.target.value).some(p=>p.id===predecessorId))setPredecessorId('')}} required/></label><label>计划交付时间（可选）<input type="datetime-local" value={due} min={start} onChange={e=>setDue(e.target.value)}/></label></div><label className="relation-field"><span><Link2/>关联以前的项目（可选）</span><select value={predecessorId} onChange={e=>setPredecessorId(e.target.value)}><option value="">不关联</option>{relationOptions.map(p=><option value={p.id} key={p.id}>{p.name} · {format(parseISO(p.startAt),'yyyy/M/d')}</option>)}</select><small>表示当前项目是所选项目的延续，日程气泡会显示延续标识。</small></label><label>识别颜色<div className="color-row expanded">{colors.map(c=><button type="button" className={color===c?'picked':''} style={{background:c}} key={c} onClick={()=>setColor(c)}/>)}<span className="custom-color"><input type="color" value={color} onChange={e=>setColor(e.target.value)}/><em>自定义</em></span></div></label>{due&&new Date(due)<=new Date(start)&&<p className="error">交付时间需要晚于开始时间</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!valid||saving}>{saving?'创建中…':'创建项目'}</button></div></form></div>
}

function ProjectEditor({project,projects,onClose,onSave}:{project:Project;projects:Project[];onClose:()=>void;onSave:(patch:Partial<Project>)=>void}){
  const [name,setName]=useState(project.name),[description,setDescription]=useState(project.description),[start,setStart]=useState(toLocalInput(project.startAt)),[due,setDue]=useState(toLocalInput(project.dueAt)),[completed,setCompleted]=useState(toLocalInput(project.completedAt)),[predecessorId,setPredecessorId]=useState(project.predecessorId||''),[color,setColor]=useState(project.color),[status,setStatus]=useState<ProjectStatus>(project.status)
  const relationOptions=predecessorOptions(projects,start,project.id)
  const valid=Boolean(name.trim()&&start&&(!due||new Date(due)>new Date(start))&&(!completed||new Date(completed)>=new Date(start)))
  const changeStatus=(next:ProjectStatus)=>{setStatus(next);if(next==='已完成'&&!completed)setCompleted(toLocalInput(new Date().toISOString()));if(next==='进行中')setCompleted('')}
  const changeCompleted=(value:string)=>{setCompleted(value);setStatus(value?'已完成':'进行中')}
  return <div className="modal-backdrop"><form className="modal editor-modal" onSubmit={e=>{e.preventDefault();if(!valid)return;onSave({name:name.trim(),description:description.trim(),startAt:new Date(start).toISOString(),dueAt:due?new Date(due).toISOString():undefined,predecessorId:predecessorId||undefined,color,status:completed?'已完成':status,completedAt:completed?new Date(completed).toISOString():undefined})}}><div className="modal-head"><div><p className="eyebrow">项目信息</p><h2>项目编辑</h2></div><button type="button" onClick={onClose}><X/></button></div><label>项目名称<input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label><label>项目说明<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="form-row"><label>开始时间<input type="datetime-local" value={start} onChange={e=>{setStart(e.target.value);if(predecessorId&&!predecessorOptions(projects,e.target.value,project.id).some(p=>p.id===predecessorId))setPredecessorId('')}}/></label><label>计划交付时间<input type="datetime-local" value={due} min={start} onChange={e=>setDue(e.target.value)}/></label></div><label className="relation-field"><span><Link2/>关联以前的项目（可选）</span><select value={predecessorId} onChange={e=>setPredecessorId(e.target.value)}><option value="">不关联</option>{relationOptions.map(p=><option value={p.id} key={p.id}>{p.name} · {format(parseISO(p.startAt),'yyyy/M/d')}</option>)}</select><small>不会显示当前项目或其后续项目，避免形成循环关联。</small></label><div className="form-row"><label>结束时间<input type="datetime-local" value={completed} min={start} onChange={e=>changeCompleted(e.target.value)}/><small className="field-help">修改后会立即改变气泡终点</small></label><label>项目状态<select value={status} onChange={e=>changeStatus(e.target.value as ProjectStatus)}><option value="进行中">进行中</option><option value="已完成">已完成</option></select><small className="field-help">清空结束时间即可恢复为进行中</small></label></div><label>识别颜色<div className="color-row expanded">{colors.map(c=><button type="button" className={color===c?'picked':''} style={{background:c}} key={c} onClick={()=>setColor(c)}/>)}<span className="custom-color"><input type="color" value={color} onChange={e=>setColor(e.target.value)}/><em>自定义</em></span></div></label>{completed&&new Date(completed)<new Date(start)&&<p className="error">结束时间不能早于开始时间</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!valid}>保存更改</button></div></form></div>
}

function ScheduleModal({value,onSave,onClose,required=false}:{value:WorkSettings;onSave:(s:WorkSettings)=>void;onClose?:()=>void;required?:boolean}){
  const [form,setForm]=useState(value),valid=form.startHour<form.breakStart&&form.breakStart<form.breakEnd&&form.breakEnd<=form.endHour
  const field=(key:'startHour'|'endHour'|'breakStart'|'breakEnd')=><input type="time" step="1800" value={hourText(form[key])} onChange={e=>{const [h,m]=e.target.value.split(':').map(Number);setForm({...form,[key]:h+m/60})}}/>
  const presets:{name:WorkSettings['weekPreset'];days:number[]}[]=[{name:'双休',days:[1,2,3,4,5]},{name:'单休',days:[1,2,3,4,5,6]},{name:'大小周',days:[1,2,3,4,5]},{name:'自定义',days:form.workDays}]
  const choose=(name:WorkSettings['weekPreset'],days:number[])=>setForm({...form,weekPreset:name,workDays:days})
  return <div className="modal-backdrop"><form className="modal schedule-modal" onSubmit={e=>{e.preventDefault();if(valid)onSave(form)}}><div className="modal-head"><div><p className="eyebrow">排期基础</p><h2>{required?'先设置你的工作日历':'工作日历设置'}</h2></div>{!required&&<button type="button" onClick={onClose}><X/></button>}</div><p className="modal-intro">工作日历会直接参与排期：项目跳过休息、请假和调休日，并在加班日继续延伸。单日例外可在月历日期上右键设置。</p><h3 className="settings-title">每日时间</h3><div className="form-row"><label>上班时间{field('startHour')}</label><label>下班时间{field('endHour')}</label></div><div className="form-row"><label>休息开始{field('breakStart')}</label><label>休息结束{field('breakEnd')}</label></div><h3 className="settings-title">每周工作日</h3><div className="preset-row">{presets.map(p=><button type="button" key={p.name} className={form.weekPreset===p.name?'active':''} onClick={()=>choose(p.name,p.days)}>{p.name}</button>)}</div>{form.weekPreset==='大小周'&&<label className="check-row"><input type="checkbox" checked={form.bigWeekStartsThisWeek} onChange={e=>setForm({...form,bigWeekStartsThisWeek:e.target.checked})}/><span>本周为大周（周六上班）</span></label>}{form.weekPreset==='自定义'&&<div className="weekday-row">{['日','一','二','三','四','五','六'].map((d,i)=><button type="button" key={d} className={form.workDays.includes(i)?'active':''} onClick={()=>setForm({...form,workDays:form.workDays.includes(i)?form.workDays.filter(x=>x!==i):[...form.workDays,i]})}>周{d}</button>)}</div>}<h3 className="settings-title">例外规则</h3><label className="check-row"><input type="checkbox" checked={form.publicHolidays} onChange={e=>setForm({...form,publicHolidays:e.target.checked})}/><span><b>自动计算中国法定节假日</b><small>使用随应用更新的离线节假日数据</small></span></label><label className="check-row nested"><input type="checkbox" disabled={!form.publicHolidays} checked={form.makeupWorkdays} onChange={e=>setForm({...form,makeupWorkdays:e.target.checked})}/><span>同时识别法定调休工作日</span></label><label className="check-row"><input type="checkbox" checked={form.irregularRest} onChange={e=>setForm({...form,irregularRest:e.target.checked})}/><span><b>不定期休息</b><small>把下面日期作为额外休息日</small></span></label>{form.irregularRest&&<label>额外休息日期 <small>以逗号分隔</small><input value={form.restDates.join(', ')} placeholder="2026-08-21, 2026-09-03" onChange={e=>setForm({...form,restDates:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/></label>}{!valid&&<p className="error">休息时间需要位于上班和下班时间之间</p>}<div className="modal-actions">{!required&&<button type="button" className="secondary" onClick={onClose}>取消</button>}<button className="primary" disabled={!valid}>保存工作日历</button></div></form></div>
}

function ContextMenu({x,y,project,onOpen,onDelete}:{x:number;y:number;project:Project;onOpen:()=>void;onDelete:()=>void}){return <div className="context-menu" style={{left:Math.min(x,window.innerWidth-190),top:Math.min(y,window.innerHeight-110)}} onClick={e=>e.stopPropagation()}><button onClick={onOpen}><FolderOpen/>打开项目</button><button className="menu-delete" onClick={onDelete}><Trash2/>删除项目</button></div>}
function DayContextMenu({x,y,date,current,onChoose}:{x:number;y:number;date:Date;current?:DayOverride;onChoose:(value?:DayOverride)=>void}){return <div className="context-menu day-context-menu" style={{left:Math.min(x,window.innerWidth-220),top:Math.min(y,window.innerHeight-230)}} onClick={e=>e.stopPropagation()}><header><b>{format(date,'M月d日 EEEE',{locale:zhCN})}</b><small>设置后立即重新计算项目排期</small></header><button className={current==='leave'?'selected':''} onClick={()=>onChoose('leave')}><i className="override-dot leave"/><span>请假<small>当天不安排项目</small></span></button><button className={current==='timeoff'?'selected':''} onClick={()=>onChoose('timeoff')}><i className="override-dot timeoff"/><span>调休<small>当天不安排项目</small></span></button><button className={current==='overtime'?'selected':''} onClick={()=>onChoose('overtime')}><i className="override-dot overtime"/><span>加班<small>作为工作日延伸项目</small></span></button>{current&&<button className="clear-override" onClick={()=>onChoose()}><X/>恢复默认日历</button>}</div>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><CalendarDays/><h3>{title}</h3><p>{text}</p></div>}
export default App
