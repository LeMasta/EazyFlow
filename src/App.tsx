import { useEffect, useState } from 'react'
import { addDays, addMonths, differenceInCalendarWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isWithinInterval, parseISO, startOfDay, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Edit3, ExternalLink, File as FileIcon, FileCheck2, FileInput, FolderOpen, LayoutGrid, MoreHorizontal, Plus, RefreshCw, Search, Settings2, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react'
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
const defaultSchedule:WorkSettings={startHour:9,endHour:18,breakStart:12,breakEnd:13,weekPreset:'双休',workDays:[1,2,3,4,5],bigWeekStartsThisWeek:true,publicHolidays:true,makeupWorkdays:true,irregularRest:false,restDates:[],dayOverrides:{}}
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
  const [settings,setSettings]=useState<WorkSettings|null|undefined>()
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
  const load=async()=>{const s=await window.eazyflow.getSnapshot();setProjects(s.projects);setSettings(s.settings)}
  useEffect(()=>{load();return window.eazyflow.onUpdateStatus(setUpdate)},[])
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),30000);return()=>window.clearInterval(timer)},[])
  useEffect(()=>{const close=()=>{setContext(null);setDayContext(null)};window.addEventListener('click',close);return()=>window.removeEventListener('click',close)},[])
  const active=projects.find(p=>p.id===activeId)
  const visible=projects.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()))
  const remove=async(p:Project)=>{
    if(!confirm(`删除项目“${p.name}”？\n\n项目文件夹会移入 Windows 回收站，项目记录将从 EazyFlow 中移除。`))return
    await window.eazyflow.deleteProject(p.id);if(activeId===p.id)setActiveId(null);setContext(null);await load()
  }
  const showContext=(e:React.MouseEvent,p:Project)=>{e.preventDefault();setContext({x:e.clientX,y:e.clientY,project:p})}
  const setDayOverride=async(date:Date,value?:DayOverride)=>{if(!settings)return;const key=dateKey(date),next={...settings.dayOverrides};if(value)next[key]=value;else delete next[key];const updated={...settings,dayOverrides:next};await window.eazyflow.updateSettings(updated);setSettings(updated);setDayContext(null)}
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="primary wide" onClick={()=>setCreating(true)}><Plus/>新建项目</button>
      <nav><button className={!active?'selected':''} onClick={()=>setActiveId(null)}><CalendarDays/>时间表</button><div className="nav-caption">最近项目</div>{projects.slice(0,6).map(p=><button key={p.id} className={active?.id===p.id?'selected':''} onClick={()=>setActiveId(p.id)}><i style={{background:p.color}}/>{p.name}</button>)}</nav>
      <div className="sidebar-bottom">{update&&<div className="update-note">{update}</div>}{update.includes('已下载')&&<button style={{background:'#f7f5ef',color:'#24231f'}} onClick={()=>window.eazyflow.installUpdate()}><RefreshCw/>立即安装更新</button>}<button onClick={()=>window.eazyflow.checkForUpdates()}><RefreshCw/>检查更新</button></div>
    </aside>
    <main>{active?<ProjectPage project={active} now={now} onBack={()=>setActiveId(null)} onChanged={load} onDelete={()=>remove(active)}/>:<>
      <header className="topbar"><div className="date-title"><p className="eyebrow">工作概览</p><div><h1>{view==='hour'?format(cursor,'M月d日 EEEE',{locale:zhCN}):format(cursor,'yyyy年 M月',{locale:zhCN})}</h1><div className="date-nav"><button onClick={()=>setCursor(view==='hour'?addDays(cursor,-1):subMonths(cursor,1))}><ChevronLeft/></button><button className="today" onClick={()=>setCursor(new Date())}>今天</button><button onClick={()=>setCursor(view==='hour'?addDays(cursor,1):addMonths(cursor,1))}><ChevronRight/></button></div></div></div><div className="top-actions"><div className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索项目"/></div></div></header>
      <section className="toolbar"><div className="segmented"><button className={view==='hour'?'active':''} onClick={()=>setView('hour')}><Clock3/>小时表</button><button className={view==='month'?'active':''} onClick={()=>setView('month')}><LayoutGrid/>月历</button></div><button className="schedule-button" onClick={()=>setScheduleOpen(true)}><Settings2/>工作日历</button></section>
      {settings&&(view==='hour'?<HourView date={cursor} now={now} projects={visible} settings={settings} onOpen={p=>setActiveId(p.id)} onContext={showContext}/>:<MonthView month={cursor} now={now} projects={visible} settings={settings} onOpen={p=>setActiveId(p.id)} onContext={showContext} onDateContext={(e,date)=>{e.preventDefault();setDayContext({x:e.clientX,y:e.clientY,date})}}/>)}
    </>}</main>
    {creating&&<CreateProject onClose={()=>setCreating(false)} onCreated={p=>{setProjects(x=>[...x,p]);setCreating(false)}}/>}
    {settings===null&&<ScheduleModal required value={defaultSchedule} onSave={async s=>{await window.eazyflow.updateSettings(s);setSettings(s)}}/>}
    {scheduleOpen&&settings&&<ScheduleModal value={settings} onClose={()=>setScheduleOpen(false)} onSave={async s=>{await window.eazyflow.updateSettings(s);setSettings(s);setScheduleOpen(false)}}/>}
    {context&&<ContextMenu {...context} onOpen={()=>setActiveId(context.project.id)} onDelete={()=>remove(context.project)}/>}
    {dayContext&&settings&&<DayContextMenu {...dayContext} current={settings.dayOverrides?.[dateKey(dayContext.date)]} onChoose={value=>setDayOverride(dayContext.date,value)}/>}
  </div>
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
  return <div className={`horizontal-row ${completed?'completed-row':''} ${overdue?'overdue-row':''}`} onContextMenu={onContext}><button className="row-project" onDoubleClick={onOpen}><i style={{background:completed?'#7b9a82':overdue?'#d0444f':project.color}}/><span><b>{project.name}</b><small>{completed?'✓ 已完成':overdue?'! 已逾期':effectiveStatus(project,now)}</small></span></button><div className="row-timeline" style={{width:timelineWidth,backgroundSize:`${zoom}px 100%`}}><div className="break-band" style={{left:(settings.breakStart-settings.startHour)*zoom,width:(settings.breakEnd-settings.breakStart)*zoom}}/><button className={`horizontal-bubble ${followsNow?'open-ended':''} ${completed?'completed-bubble':''} ${overdue?'overdue-bubble':''}`} style={{left:(a-settings.startHour)*zoom,width:Math.max(34,(b-a)*zoom),'--bubble':project.color} as React.CSSProperties} onDoubleClick={onOpen} title={`${project.name}\n${format(start,'M月d日 HH:mm')} 开始\n${completed&&project.completedAt?'实际结束 '+format(parseISO(project.completedAt),'M月d日 HH:mm'):overdue&&due?'已超过计划交付 '+format(due,'M月d日 HH:mm'):due?format(due,'M月d日 HH:mm')+' 计划交付':'结束时间未定'}\n双击进入，右键管理`}><b>{completed?'✓ ':overdue?'! ':''}{project.name}</b><small>{hourText(a)}—{hourText(b)}{followsNow?' · 随当前时间推进':''}</small></button>{showNow&&!completed&&<div className="now-line" style={{left:(now.getHours()+now.getMinutes()/60-settings.startHour)*zoom}}/>}</div></div>
}

function MonthView({month,now,projects,settings,onOpen,onContext,onDateContext}:{month:Date;now:Date;projects:Project[];settings:WorkSettings;onOpen:(p:Project)=>void;onContext:(e:React.MouseEvent,p:Project)=>void;onDateContext:(e:React.MouseEvent,date:Date)=>void}){
  const start=startOfWeek(startOfMonth(month),{weekStartsOn:1}),end=endOfWeek(endOfMonth(month),{weekStartsOn:1}),days=eachDayOfInterval({start,end})
  const onDay=(p:Project,d:Date)=>{
    if(!isWorkingDate(d,settings))return false
    const projectStart=startOfDay(parseISO(p.startAt)),projectFinish=endOfDay(projectEnd(p,now))
    return projectStart<=projectFinish&&isWithinInterval(d,{start:projectStart,end:projectFinish})
  }
  return <section className="month-card"><div className="weekdays">{'一二三四五六日'.split('').map(d=><span key={d}>周{d}</span>)}</div><div className="month-grid">{days.map(day=>{const all=projects.filter(p=>onDay(p,day)),working=isWorkingDate(day,settings),festival=settings.publicHolidays?getFestival(dateKey(day)):'',override=settings.dayOverrides?.[dateKey(day)];return <div onContextMenu={e=>onDateContext(e,day)} className={`day ${!isSameMonth(day,month)?'muted':''} ${isSameDay(day,now)?'today-day':''} ${working?'':'rest-day'} ${override?`override-${override}`:''}`} key={dateKey(day)}><span className="day-num">{format(day,'d')}</span><small className="day-kind">{override==='leave'?'请假':override==='timeoff'?'调休':override==='overtime'?'加班':festival|| (working?'工作日':'休息')}</small><div className="day-items">{all.slice(0,3).map(p=>{const begins=isSameDay(day,parseISO(p.startAt)),completed=p.status==='已完成',overdue=isOverdue(p,now),afterDue=overdue&&p.dueAt&&day>=startOfDay(parseISO(p.dueAt)),last=isSameDay(day,projectEnd(p,now));return <button key={p.id} onDoubleClick={()=>onOpen(p)} onContextMenu={e=>{e.stopPropagation();onContext(e,p)}} className={`month-pill ${!p.dueAt?'undated':''} ${completed?'completed-pill':''} ${afterDue?'overdue-pill':''}`} style={{'--bubble':p.color} as React.CSSProperties} title={`${p.name}\n${p.description}\n${completed&&p.completedAt?'实际结束 '+format(parseISO(p.completedAt),'M月d日 HH:mm'):overdue&&p.dueAt?'已超过计划交付 '+format(parseISO(p.dueAt),'M月d日 HH:mm'):p.dueAt?'计划交付 '+format(parseISO(p.dueAt),'M月d日 HH:mm'):'结束时间未定'}`}><span>{completed&&last?'✓ ':afterDue?'! ':''}{begins?p.name:`↪ ${p.name}`}</span>{afterDue?<em>逾期</em>:!p.dueAt&&!completed&&<em>{last?'今日延伸':'持续中'}</em>}</button>})}{all.length>3&&<small className="more">+ {all.length-3} 个</small>}</div></div>})}</div></section>
}

function ProjectPage({project,now,onBack,onChanged,onDelete}:{project:Project;now:Date;onBack:()=>void;onChanged:()=>void;onDelete:()=>void}){
  const status=effectiveStatus(project,now),overdue=isOverdue(project,now),variance=deliveryVariance(project)
  const [editing,setEditing]=useState(false)
  const finish=async()=>{if(confirm(`结束项目“${project.name}”？\n\n时间表会立即以当前时间截断项目占用。`)){await window.eazyflow.updateProject(project.id,{status:'已完成',completedAt:new Date().toISOString()});await onChanged()}}
  return <div className="project-page"><header className="project-top"><button className="back" onClick={onBack}><ChevronLeft/>返回时间表</button><div className="project-actions">{status!=='已完成'&&<button className="finish-button" onClick={finish}><CheckCircle2/>结束项目</button>}<details className="more-menu"><summary className="ghost"><MoreHorizontal/></summary><div className="menu-popover"><button onClick={()=>setEditing(true)}><Edit3/>项目编辑</button><button className="menu-delete" onClick={onDelete}><Trash2/>删除项目</button></div></details></div></header><section className={`project-hero ${status==='已完成'?'completed-hero':''} ${overdue?'overdue-hero':''}`}><div className="project-title"><i style={{background:overdue?'#d0444f':project.color}}/><div><p className="eyebrow">项目工作区</p><h1>{status==='已完成'?'✓ ':overdue?'! ':''}{project.name}</h1><p>{project.description||'暂无项目说明'}</p></div></div><div className="project-meta"><div><span>状态</span><b className={`status ${overdue?'overdue-status':''}`}>{overdue?'已逾期':status}</b></div><div><span>开始时间</span><b>{format(parseISO(project.startAt),'yyyy年M月d日 HH:mm')}</b></div><div><span>计划交付</span><b>{project.dueAt?format(parseISO(project.dueAt),'yyyy年M月d日 HH:mm'):'未设置'}</b></div><div><span>结束时间</span><b>{project.completedAt?format(parseISO(project.completedAt),'yyyy年M月d日 HH:mm'):'尚未结束'}</b>{variance&&<em className={variance.startsWith('逾期')?'late-variance':'early-variance'}>{variance}</em>}</div></div></section><ProjectFiles project={project} onChanged={onChanged}/>{editing&&<ProjectEditor project={project} onClose={()=>setEditing(false)} onSave={async patch=>{await window.eazyflow.updateProject(project.id,patch);setEditing(false);await onChanged()}}/>}</div>
}

function ProjectFiles({project,onChanged}:{project:Project;onChanged:()=>void}){
  const [active,setActive]=useState<FileCategory>('task')
  const category=categories.find(c=>c.id===active)!
  const files=project.files.filter(f=>f.category===active)
  return <section className="materials-workspace"><div className="material-tabs">{categories.map(c=>{const Icon=c.icon,count=project.files.filter(f=>f.category===c.id).length;return <button key={c.id} className={active===c.id?'active':''} onClick={()=>setActive(c.id)}><Icon/><span>{c.label}</span><em>{count}</em></button>})}</div><FileSection projectId={project.id} category={category} files={files} onImport={async()=>{await window.eazyflow.importFiles(project.id,category.id);await onChanged()}} onDrop={async dropped=>{await window.eazyflow.importDroppedFiles(project.id,category.id,dropped);await onChanged()}} onOpen={f=>window.eazyflow.openFile(project.id,f.id)} onReveal={f=>window.eazyflow.revealFile(project.id,f.id)} onDelete={async f=>{if(confirm(`确定从项目中删除“${f.name}”吗？`)){await window.eazyflow.deleteFile(project.id,f.id);await onChanged()}}}/></section>
}

const imageExtensions=new Set(['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg'])
function FileSection({projectId,category,files,onImport,onDrop,onOpen,onReveal,onDelete}:{projectId:string;category:typeof categories[number];files:ProjectFile[];onImport:()=>void;onDrop:(files:File[])=>void;onOpen:(f:ProjectFile)=>void;onReveal:(f:ProjectFile)=>void;onDelete:(f:ProjectFile)=>void}){
  const Icon=category.icon,[dragging,setDragging]=useState(false),images=files.filter(f=>imageExtensions.has(f.extension.toLowerCase())),documents=files.filter(f=>!imageExtensions.has(f.extension.toLowerCase()))
  return <section className={`file-section material-panel ${dragging?'dragging':''}`} onDragEnter={e=>{e.preventDefault();setDragging(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}} onDrop={e=>{e.preventDefault();setDragging(false);const dropped=Array.from(e.dataTransfer.files);if(dropped.length)onDrop(dropped)}}><div className="file-heading"><div className="file-heading-icon"><Icon/></div><div><h3>{category.label}<span>{files.length}</span></h3><p>{category.hint}；图片可直接预览</p></div><button onClick={onImport}><Plus/>添加文件</button></div>{files.length===0?<button className="drop-hint material-empty" onClick={onImport}><Upload/><b>{dragging?'松开即可复制到项目':'把文件、截图或图片拖到这里'}</b><span>也可以点击选择，文件会复制一份保存在项目内</span></button>:<><button className="compact-drop" onClick={onImport}><Upload/>拖放到此区域，或继续添加文件</button>{images.length>0&&<div className="image-gallery">{images.map(f=><article className="image-card" key={f.id} onDoubleClick={()=>onOpen(f)} title="双击打开原图"><img src={window.eazyflow.filePreviewUrl(projectId,f.id)} alt={f.name}/><div className="image-caption"><span><b>{f.name}</b><small>{bytes(f.size)}</small></span><div className="file-actions"><button title="打开文件" onClick={()=>onOpen(f)}><ExternalLink/></button><button title="打开所在位置" onClick={()=>onReveal(f)}><FolderOpen/></button><button className="danger" title="删除" onClick={()=>onDelete(f)}><Trash2/></button></div></div></article>)}</div>}{documents.length>0&&<div className="file-list document-list">{documents.map(f=><div className="file-row" key={f.id} onDoubleClick={()=>onOpen(f)} title="双击打开文件"><div className="file-type">{f.extension.replace('.','').slice(0,4)||'FILE'}</div><div className="file-info"><b>{f.name}</b><small>{bytes(f.size)} · 双击打开</small></div><div className="file-actions"><button title="打开文件" onClick={()=>onOpen(f)}><ExternalLink/></button><button title="打开所在位置" onClick={()=>onReveal(f)}><FolderOpen/></button><button className="danger" title="删除" onClick={()=>onDelete(f)}><Trash2/></button></div></div>)}</div>}</>}{dragging&&<div className="drop-overlay"><Upload/>复制到“{category.label}”</div>}</section>
}

function CreateProject({onClose,onCreated}:{onClose:()=>void;onCreated:(p:Project)=>void}){
  const [name,setName]=useState(''),[description,setDescription]=useState(''),[start,setStart]=useState(toLocalInput(new Date().toISOString())),[due,setDue]=useState(''),[color,setColor]=useState(colors[0]),[saving,setSaving]=useState(false)
  const valid=Boolean(name.trim()&&start&&(!due||new Date(due)>new Date(start)))
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!valid)return;setSaving(true);const p=await window.eazyflow.createProject({name:name.trim(),description:description.trim(),color,status:'进行中',startAt:new Date(start).toISOString(),...(due?{dueAt:new Date(due).toISOString()}:{})});onCreated(p)}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">创建工作空间</p><h2>新建项目</h2></div><button type="button" onClick={onClose}><X/></button></div><label>项目名称<input autoFocus value={name} onInput={e=>setName(e.currentTarget.value)} onChange={e=>setName(e.target.value)} placeholder="例如：品牌视觉提案"/></label><label>项目说明<textarea value={description} onInput={e=>setDescription(e.currentTarget.value)} onChange={e=>setDescription(e.target.value)} placeholder="简单记录任务目标或背景（选填）"/></label><div className="form-row"><label>开始时间<input type="datetime-local" value={start} onInput={e=>setStart(e.currentTarget.value)} onChange={e=>setStart(e.target.value)} required/></label><label>计划交付时间（可选）<input type="datetime-local" value={due} min={start} onInput={e=>setDue(e.currentTarget.value)} onChange={e=>setDue(e.target.value)}/></label></div><label>识别颜色<div className="color-row expanded">{colors.map(c=><button type="button" className={color===c?'picked':''} style={{background:c}} key={c} onClick={()=>setColor(c)}/>)}<span className="custom-color"><input type="color" value={color} onChange={e=>setColor(e.target.value)}/><em>自定义</em></span></div></label>{due&&new Date(due)<=new Date(start)&&<p className="error">交付时间需要晚于开始时间</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!valid||saving}>{saving?'创建中…':'创建项目'}</button></div></form></div>
}

function ProjectEditor({project,onClose,onSave}:{project:Project;onClose:()=>void;onSave:(patch:Partial<Project>)=>void}){
  const [name,setName]=useState(project.name),[description,setDescription]=useState(project.description),[start,setStart]=useState(toLocalInput(project.startAt)),[due,setDue]=useState(toLocalInput(project.dueAt)),[completed,setCompleted]=useState(toLocalInput(project.completedAt)),[color,setColor]=useState(project.color),[status,setStatus]=useState<ProjectStatus>(project.status)
  const valid=Boolean(name.trim()&&start&&(!due||new Date(due)>new Date(start))&&(!completed||new Date(completed)>=new Date(start)))
  const changeStatus=(next:ProjectStatus)=>{setStatus(next);if(next==='已完成'&&!completed)setCompleted(toLocalInput(new Date().toISOString()));if(next==='进行中')setCompleted('')}
  const changeCompleted=(value:string)=>{setCompleted(value);setStatus(value?'已完成':'进行中')}
  return <div className="modal-backdrop"><form className="modal editor-modal" onSubmit={e=>{e.preventDefault();if(!valid)return;onSave({name:name.trim(),description:description.trim(),startAt:new Date(start).toISOString(),dueAt:due?new Date(due).toISOString():undefined,color,status:completed?'已完成':status,completedAt:completed?new Date(completed).toISOString():undefined})}}><div className="modal-head"><div><p className="eyebrow">项目信息</p><h2>项目编辑</h2></div><button type="button" onClick={onClose}><X/></button></div><label>项目名称<input autoFocus value={name} onInput={e=>setName(e.currentTarget.value)} onChange={e=>setName(e.target.value)}/></label><label>项目说明<textarea value={description} onInput={e=>setDescription(e.currentTarget.value)} onChange={e=>setDescription(e.target.value)}/></label><div className="form-row"><label>开始时间<input type="datetime-local" value={start} onInput={e=>setStart(e.currentTarget.value)} onChange={e=>setStart(e.target.value)}/></label><label>计划交付时间<input type="datetime-local" value={due} min={start} onInput={e=>setDue(e.currentTarget.value)} onChange={e=>setDue(e.target.value)}/></label></div><div className="form-row"><label>结束时间<input type="datetime-local" value={completed} min={start} onInput={e=>changeCompleted(e.currentTarget.value)} onChange={e=>changeCompleted(e.target.value)}/><small className="field-help">修改后会立即改变气泡终点</small></label><label>项目状态<select value={status} onChange={e=>changeStatus(e.target.value as ProjectStatus)}><option value="进行中">进行中</option><option value="已完成">已完成</option></select><small className="field-help">清空结束时间即可恢复为进行中</small></label></div><label>识别颜色<div className="color-row expanded">{colors.map(c=><button type="button" className={color===c?'picked':''} style={{background:c}} key={c} onClick={()=>setColor(c)}/>)}<span className="custom-color"><input type="color" value={color} onChange={e=>setColor(e.target.value)}/><em>自定义</em></span></div></label>{completed&&new Date(completed)<new Date(start)&&<p className="error">结束时间不能早于开始时间</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!valid}>保存更改</button></div></form></div>
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
