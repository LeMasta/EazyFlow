import { useEffect, useState } from 'react'
import { addDays, addMonths, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isWithinInterval, parseISO, startOfDay, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, File, FileCheck2, FileInput, FolderOpen, LayoutGrid, MoreHorizontal, Plus, RefreshCw, Search, Settings2, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { DisplayStatus, FileCategory, Project, ProjectFile, ProjectStatus, WorkSettings } from './types'

const categories: { id: FileCategory; label: string; hint: string; icon: typeof File }[] = [
  { id: 'task', label: '任务文件', hint: '需求、原始素材与任务说明', icon: FileInput },
  { id: 'reference', label: '参考文件', hint: '灵感、范例与背景资料', icon: FolderOpen },
  { id: 'delivery', label: '交付文件', hint: '最终版本与交付记录', icon: FileCheck2 },
  { id: 'other', label: '其他', hint: '过程稿和暂未归类的内容', icon: File }
]
const colors = ['#7557d9','#9b59b6','#5c6ac4','#477fbd','#3b9fd4','#36a9a1','#4c9b86','#66a84f','#94a83d','#b38a36','#d4a72c','#e18b57','#df704d','#d45f70','#c94f8a','#8d6e63','#657079','#343a40']
const dateKey = (d: Date) => format(d, 'yyyy-MM-dd')
const toLocalInput = (iso?: string) => iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : ''
const bytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
const effectiveStatus = (p: Project): DisplayStatus => p.status === '已完成' || p.status === '已归档' ? p.status : new Date() < parseISO(p.startAt) ? '未开始' : '进行中'
const hourText = (n:number) => {
  const hour=Math.floor(n),minute=Math.round((n-hour)*60)
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
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
  const load=async()=>{const s=await window.eazyflow.getSnapshot();setProjects(s.projects);setSettings(s.settings)}
  useEffect(()=>{load();return window.eazyflow.onUpdateStatus(setUpdate)},[])
  useEffect(()=>{const close=()=>setContext(null);window.addEventListener('click',close);return()=>window.removeEventListener('click',close)},[])
  const active=projects.find(p=>p.id===activeId)
  const visible=projects.filter(p=>p.status!=='已归档'&&p.name.toLowerCase().includes(search.toLowerCase()))
  const remove=async(p:Project)=>{
    if(!confirm(`删除项目“${p.name}”？\n\n项目文件夹会移入 Windows 回收站，项目记录将从 EazyFlow 中移除。`))return
    await window.eazyflow.deleteProject(p.id);if(activeId===p.id)setActiveId(null);setContext(null);await load()
  }
  const showContext=(e:React.MouseEvent,p:Project)=>{e.preventDefault();setContext({x:e.clientX,y:e.clientY,project:p})}
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">E</span><span>EazyFlow</span></div>
      <button className="primary wide" onClick={()=>setCreating(true)}><Plus/>新建项目</button>
      <nav><button className={!active?'selected':''} onClick={()=>setActiveId(null)}><CalendarDays/>时间表</button><div className="nav-caption">最近项目</div>{projects.slice(0,6).map(p=><button key={p.id} className={active?.id===p.id?'selected':''} onClick={()=>setActiveId(p.id)}><i style={{background:p.color}}/>{p.name}</button>)}</nav>
      <div className="sidebar-bottom">{update&&<div className="update-note">{update}</div>}{update.includes('已下载')&&<button style={{background:'#f7f5ef',color:'#24231f'}} onClick={()=>window.eazyflow.installUpdate()}><RefreshCw/>立即安装更新</button>}<button onClick={()=>window.eazyflow.checkForUpdates()}><RefreshCw/>检查更新</button></div>
    </aside>
    <main>{active?<ProjectPage project={active} onBack={()=>setActiveId(null)} onChanged={load} onDelete={()=>remove(active)}/>:<>
      <header className="topbar"><div><p className="eyebrow">工作概览</p><h1>{view==='hour'?format(cursor,'M月d日 EEEE',{locale:zhCN}):format(cursor,'yyyy年 M月',{locale:zhCN})}</h1></div><div className="top-actions"><div className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索项目"/></div><button className="primary" onClick={()=>setCreating(true)}><Plus/>新建项目</button></div></header>
      <section className="toolbar"><div className="segmented"><button className={view==='hour'?'active':''} onClick={()=>setView('hour')}><Clock3/>小时表</button><button className={view==='month'?'active':''} onClick={()=>setView('month')}><LayoutGrid/>月历</button></div><div className="toolbar-right">{view==='hour'&&<button className="schedule-button" onClick={()=>setScheduleOpen(true)}><Settings2/>工作时间</button>}<div className="date-nav"><button onClick={()=>setCursor(view==='hour'?addDays(cursor,-1):subMonths(cursor,1))}><ChevronLeft/></button><button className="today" onClick={()=>setCursor(new Date())}>今天</button><button onClick={()=>setCursor(view==='hour'?addDays(cursor,1):addMonths(cursor,1))}><ChevronRight/></button></div></div></section>
      {settings&&(view==='hour'?<HourView date={cursor} projects={visible} settings={settings} onOpen={p=>setActiveId(p.id)} onContext={showContext}/>:<MonthView month={cursor} projects={visible} onOpen={p=>setActiveId(p.id)} onContext={showContext}/>)}
    </>}</main>
    {creating&&<CreateProject onClose={()=>setCreating(false)} onCreated={p=>{setProjects(x=>[...x,p]);setCreating(false)}}/>}
    {settings===null&&<ScheduleModal required value={{startHour:9,endHour:18,breakStart:12,breakEnd:13}} onSave={async s=>{await window.eazyflow.updateSettings(s);setSettings(s)}}/>}
    {scheduleOpen&&settings&&<ScheduleModal value={settings} onClose={()=>setScheduleOpen(false)} onSave={async s=>{await window.eazyflow.updateSettings(s);setSettings(s);setScheduleOpen(false)}}/>}
    {context&&<ContextMenu {...context} onOpen={()=>setActiveId(context.project.id)} onDelete={()=>remove(context.project)}/>}
  </div>
}

function HourView({date,projects,settings,onOpen,onContext}:{date:Date;projects:Project[];settings:WorkSettings;onOpen:(p:Project)=>void;onContext:(e:React.MouseEvent,p:Project)=>void}){
  const [zoom,setZoom]=useState(88),start=startOfDay(date),end=endOfDay(date)
  const shown=projects.filter(p=>parseISO(p.startAt)<=end&&(!p.dueAt||parseISO(p.dueAt)>=start))
  const hours=Array.from({length:settings.endHour-settings.startHour+1},(_,i)=>settings.startHour+i),width=(settings.endHour-settings.startHour)*zoom
  return <section className="hour-card horizontal-hour"><div className="zoom-bar"><span>{hourText(settings.startHour)}—{hourText(settings.endHour)} · 休息 {hourText(settings.breakStart)}—{hourText(settings.breakEnd)}</span><div><button onClick={()=>setZoom(z=>Math.max(52,z-12))}><ZoomOut/></button><b>{Math.round(zoom/88*100)}%</b><button onClick={()=>setZoom(z=>Math.min(160,z+12))}><ZoomIn/></button></div></div>{shown.length===0?<Empty title="这一天没有安排" text="新建项目，或切换到其他日期查看。"/>:<div className="horizontal-scroll"><div className="horizontal-table" style={{width:width+210}}><div className="hour-axis-label">项目</div><div className="hour-axis" style={{width}}>{hours.map(h=><span key={h} style={{left:(h-settings.startHour)*zoom}}>{hourText(h)}</span>)}</div>{shown.map(p=><HourRow key={p.id} project={p} date={date} settings={settings} zoom={zoom} timelineWidth={width} onOpen={()=>onOpen(p)} onContext={e=>onContext(e,p)}/>)}</div></div>}</section>
}

function HourRow({project,date,settings,zoom,timelineWidth,onOpen,onContext}:{project:Project;date:Date;settings:WorkSettings;zoom:number;timelineWidth:number;onOpen:()=>void;onContext:(e:React.MouseEvent)=>void}){
  const start=parseISO(project.startAt),due=project.dueAt?parseISO(project.dueAt):null
  const rawStart=isSameDay(start,date)?start.getHours()+start.getMinutes()/60:settings.startHour
  const rawEnd=due&&isSameDay(due,date)?due.getHours()+due.getMinutes()/60:settings.endHour
  const a=Math.max(settings.startHour,Math.min(settings.endHour,rawStart)),b=Math.max(a+.15,Math.min(settings.endHour,rawEnd))
  const now=new Date(),showNow=isSameDay(now,date)&&now.getHours()+now.getMinutes()/60>=settings.startHour&&now.getHours()+now.getMinutes()/60<=settings.endHour
  return <div className="horizontal-row" onContextMenu={onContext}><button className="row-project" onDoubleClick={onOpen}><i style={{background:project.color}}/><span><b>{project.name}</b><small>{effectiveStatus(project)}</small></span></button><div className="row-timeline" style={{width:timelineWidth,backgroundSize:`${zoom}px 100%`}}><div className="break-band" style={{left:(settings.breakStart-settings.startHour)*zoom,width:(settings.breakEnd-settings.breakStart)*zoom}}/><button className={`horizontal-bubble ${!due?'open-ended':''}`} style={{left:(a-settings.startHour)*zoom,width:Math.max(34,(b-a)*zoom),'--bubble':project.color} as React.CSSProperties} onDoubleClick={onOpen} title={`${project.name}\n${format(start,'M月d日 HH:mm')} 开始\n${due?format(due,'M月d日 HH:mm')+' 交付':'交付日期未定'}\n双击进入，右键管理`}><b>{project.name}</b><small>{hourText(a)}{due?`—${hourText(b)}`:'—持续中'}</small></button>{showNow&&<div className="now-line" style={{left:(now.getHours()+now.getMinutes()/60-settings.startHour)*zoom}}/>}</div></div>
}

function MonthView({month,projects,onOpen,onContext}:{month:Date;projects:Project[];onOpen:(p:Project)=>void;onContext:(e:React.MouseEvent,p:Project)=>void}){
  const start=startOfWeek(startOfMonth(month),{weekStartsOn:1}),end=endOfWeek(endOfMonth(month),{weekStartsOn:1}),days=eachDayOfInterval({start,end})
  const onDay=(p:Project,d:Date)=>isWithinInterval(d,{start:startOfDay(parseISO(p.startAt)),end:p.dueAt?endOfDay(parseISO(p.dueAt)):end})
  return <section className="month-card"><div className="weekdays">{'一二三四五六日'.split('').map(d=><span key={d}>周{d}</span>)}</div><div className="month-grid">{days.map(day=>{const all=projects.filter(p=>onDay(p,day));return <div className={`day ${!isSameMonth(day,month)?'muted':''} ${isSameDay(day,new Date())?'today-day':''}`} key={dateKey(day)}><span className="day-num">{format(day,'d')}</span><div className="day-items">{all.slice(0,3).map(p=>{const begins=isSameDay(day,parseISO(p.startAt));return <button key={p.id} onDoubleClick={()=>onOpen(p)} onContextMenu={e=>onContext(e,p)} className={`month-pill ${!p.dueAt?'undated':''}`} style={{'--bubble':p.color} as React.CSSProperties} title={`${p.name}\n${p.description}\n${p.dueAt?'交付 '+format(parseISO(p.dueAt),'M月d日 HH:mm'):'交付日期未定'}`}><span>{begins?p.name:`↪ ${p.name}`}</span>{!p.dueAt&&<em>{begins?'持续中':'未定交付'}</em>}</button>})}{all.length>3&&<small className="more">+ {all.length-3} 个</small>}</div></div>})}</div></section>
}

function ProjectPage({project,onBack,onChanged,onDelete}:{project:Project;onBack:()=>void;onChanged:()=>void;onDelete:()=>void}){
  const status=effectiveStatus(project)
  const change=async(status:ProjectStatus)=>{await window.eazyflow.updateProject(project.id,{status});await onChanged()}
  const finish=async()=>{if(confirm(`结束项目“${project.name}”？\n\n结束后会标记为已完成，可在更多菜单中恢复为自动状态。`))await change('已完成')}
  return <div className="project-page"><header className="project-top"><button className="back" onClick={onBack}><ChevronLeft/>返回时间表</button><div className="project-actions">{status!=='已完成'&&status!=='已归档'&&<button className="finish-button" onClick={finish}><CheckCircle2/>结束项目</button>}<details className="more-menu"><summary className="ghost"><MoreHorizontal/></summary><div className="menu-popover"><details><summary>调整状态 <ChevronRight/></summary><div className="submenu"><button onClick={()=>change('自动')}>自动判断</button><button onClick={()=>change('已完成')}>已完成</button><button onClick={()=>change('已归档')}>已归档</button></div></details><button className="menu-delete" onClick={onDelete}><Trash2/>删除项目</button></div></details></div></header><section className="project-hero"><div className="project-title"><i style={{background:project.color}}/><div><p className="eyebrow">项目工作区</p><h1>{project.name}</h1><p>{project.description||'暂无项目说明'}</p></div></div><div className="project-meta"><div><span>状态</span><b className="status">{status}</b></div><div><span>开始</span><b>{format(parseISO(project.startAt),'yyyy年M月d日 HH:mm')}</b></div><div><span>交付</span><b>{project.dueAt?format(parseISO(project.dueAt),'yyyy年M月d日 HH:mm'):'暂未确定'}</b></div></div></section><div className="file-grid">{categories.map(c=><FileSection key={c.id} category={c} files={project.files.filter(f=>f.category===c.id)} onImport={async()=>{await window.eazyflow.importFiles(project.id,c.id);await onChanged()}} onOpen={f=>window.eazyflow.openFile(project.id,f.id)} onReveal={f=>window.eazyflow.revealFile(project.id,f.id)} onDelete={async f=>{if(confirm(`确定从项目中删除“${f.name}”吗？`)){await window.eazyflow.deleteFile(project.id,f.id);await onChanged()}}}/>)}</div></div>
}

function FileSection({category,files,onImport,onOpen,onReveal,onDelete}:{category:typeof categories[number];files:ProjectFile[];onImport:()=>void;onOpen:(f:ProjectFile)=>void;onReveal:(f:ProjectFile)=>void;onDelete:(f:ProjectFile)=>void}){const Icon=category.icon;return <section className="file-section"><div className="file-heading"><div className="file-heading-icon"><Icon/></div><div><h3>{category.label}<span>{files.length}</span></h3><p>{category.hint}</p></div><button onClick={onImport}><Plus/>添加</button></div><div className="file-list">{files.length===0?<button className="drop-hint" onClick={onImport}><Upload/><span>复制文件到此分类</span></button>:files.map(f=><div className="file-row" key={f.id} onDoubleClick={()=>onOpen(f)}><div className="file-type">{f.extension.replace('.','').slice(0,4)||'FILE'}</div><div className="file-info"><b>{f.name}</b><small>{bytes(f.size)} · {format(parseISO(f.createdAt),'M月d日 HH:mm')}</small></div><button title="打开所在位置" onClick={()=>onReveal(f)}><FolderOpen/></button><button className="danger" title="删除" onClick={()=>onDelete(f)}><Trash2/></button></div>)}</div></section>}

function CreateProject({onClose,onCreated}:{onClose:()=>void;onCreated:(p:Project)=>void}){
  const [name,setName]=useState(''),[description,setDescription]=useState(''),[start,setStart]=useState(toLocalInput(new Date().toISOString())),[due,setDue]=useState(''),[color,setColor]=useState(colors[0]),[saving,setSaving]=useState(false)
  const valid=Boolean(name.trim()&&start&&(!due||new Date(due)>new Date(start)))
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!valid)return;setSaving(true);const p=await window.eazyflow.createProject({name:name.trim(),description:description.trim(),color,status:'自动',startAt:new Date(start).toISOString(),...(due?{dueAt:new Date(due).toISOString()}:{})});onCreated(p)}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">创建工作空间</p><h2>新建项目</h2></div><button type="button" onClick={onClose}><X/></button></div><label>项目名称<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="例如：品牌视觉提案"/></label><label>项目说明<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="简单记录任务目标或背景（选填）"/></label><div className="form-row"><label>开始时间<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>交付时间 <small>可不填</small><input type="datetime-local" value={due} min={start} onChange={e=>setDue(e.target.value)}/></label></div><label>识别颜色<div className="color-row expanded">{colors.map(c=><button type="button" className={color===c?'picked':''} style={{background:c}} key={c} onClick={()=>setColor(c)}/>)}<span className="custom-color"><input type="color" value={color} onChange={e=>setColor(e.target.value)}/><em>自定义</em></span></div></label>{due&&new Date(due)<=new Date(start)&&<p className="error">交付时间需要晚于开始时间</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!valid||saving}>{saving?'创建中…':'创建项目'}</button></div></form></div>
}

function ScheduleModal({value,onSave,onClose,required=false}:{value:WorkSettings;onSave:(s:WorkSettings)=>void;onClose?:()=>void;required?:boolean}){
  const [form,setForm]=useState(value),valid=form.startHour<form.breakStart&&form.breakStart<form.breakEnd&&form.breakEnd<=form.endHour
  const field=(key:keyof WorkSettings)=><input type="time" step="1800" value={hourText(form[key])} onChange={e=>{const [h,m]=e.target.value.split(':').map(Number);setForm({...form,[key]:h+m/60})}}/>
  return <div className="modal-backdrop"><form className="modal schedule-modal" onSubmit={e=>{e.preventDefault();if(valid)onSave(form)}}><div className="modal-head"><div><p className="eyebrow">小时表偏好</p><h2>{required?'先设置你的工作时间':'工作时间设置'}</h2></div>{!required&&<button type="button" onClick={onClose}><X/></button>}</div><p className="modal-intro">小时表只显示你的工作时段，并用浅色区域标出休息时间。之后可随时修改。</p><div className="form-row"><label>上班时间{field('startHour')}</label><label>下班时间{field('endHour')}</label></div><div className="form-row"><label>休息开始{field('breakStart')}</label><label>休息结束{field('breakEnd')}</label></div>{!valid&&<p className="error">休息时间需要位于上班和下班时间之间</p>}<div className="modal-actions">{!required&&<button type="button" className="secondary" onClick={onClose}>取消</button>}<button className="primary" disabled={!valid}>保存并进入小时表</button></div></form></div>
}

function ContextMenu({x,y,project,onOpen,onDelete}:{x:number;y:number;project:Project;onOpen:()=>void;onDelete:()=>void}){return <div className="context-menu" style={{left:Math.min(x,window.innerWidth-190),top:Math.min(y,window.innerHeight-110)}} onClick={e=>e.stopPropagation()}><button onClick={onOpen}><FolderOpen/>打开项目</button><button className="menu-delete" onClick={onDelete}><Trash2/>删除项目</button></div>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><CalendarDays/><h3>{title}</h3><p>{text}</p></div>}
export default App
