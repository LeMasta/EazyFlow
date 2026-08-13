import { useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isWithinInterval, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, File, FileCheck2, FileInput, FolderOpen, LayoutGrid, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react'
import type { FileCategory, Project, ProjectFile, ProjectStatus } from './types'

const categories: { id: FileCategory; label: string; hint: string; icon: typeof File }[] = [
  { id: 'task', label: '任务文件', hint: '需求、原始素材与任务说明', icon: FileInput },
  { id: 'reference', label: '参考文件', hint: '灵感、范例与背景资料', icon: FolderOpen },
  { id: 'delivery', label: '交付文件', hint: '最终版本与交付记录', icon: FileCheck2 },
  { id: 'other', label: '其他', hint: '过程稿和暂未归类的内容', icon: File }
]
const colors = ['#7557d9', '#e18b57', '#4c9b86', '#d45f70', '#477fbd', '#b38a36']
const dateKey = (d: Date) => format(d, 'yyyy-MM-dd')
const toLocalInput = (iso?: string) => iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : ''
const bytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [view, setView] = useState<'hour' | 'month'>('hour')
  const [cursor, setCursor] = useState(new Date())
  const [active, setActive] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [update, setUpdate] = useState('')
  const load = () => window.eazyflow.getSnapshot().then((s) => setProjects(s.projects))
  useEffect(() => { load(); return window.eazyflow.onUpdateStatus(setUpdate) }, [])
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
  const goToday = () => setCursor(new Date())

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">E</span><span>EazyFlow</span></div>
      <button className="primary wide" onClick={() => setCreating(true)}><Plus size={17}/>新建项目</button>
      <nav>
        <button className={!active ? 'selected' : ''} onClick={() => setActive(null)}><CalendarDays/>时间表</button>
        <div className="nav-caption">最近项目</div>
        {projects.slice(0, 6).map((p) => <button key={p.id} className={active?.id === p.id ? 'selected' : ''} onClick={() => setActive(p)}><i style={{background:p.color}}/>{p.name}</button>)}
      </nav>
      <div className="sidebar-bottom">
        {update && <div className="update-note">{update}</div>}
        {update.includes('已下载') && <button style={{background:'#f7f5ef',color:'#24231f',marginBottom:4}} onClick={() => window.eazyflow.installUpdate()}><RefreshCw size={16}/>立即安装更新</button>}
        <button onClick={() => window.eazyflow.checkForUpdates()}><RefreshCw size={16}/>检查更新</button>
      </div>
    </aside>
    <main>
      {active ? <ProjectPage project={projects.find(p => p.id === active.id) ?? active} onBack={() => setActive(null)} onChanged={async () => { await load(); setActive((a) => projects.find(p => p.id === a?.id) ?? a) }}/>
      : <>
        <header className="topbar">
          <div><p className="eyebrow">工作概览</p><h1>{view === 'hour' ? format(cursor, 'M月d日 EEEE', {locale: zhCN}) : format(cursor, 'yyyy年 M月', {locale: zhCN})}</h1></div>
          <div className="top-actions"><div className="search"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索项目"/></div><button className="primary" onClick={() => setCreating(true)}><Plus size={17}/>新建项目</button></div>
        </header>
        <section className="toolbar">
          <div className="segmented"><button className={view === 'hour' ? 'active' : ''} onClick={() => setView('hour')}><Clock3/>小时表</button><button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}><LayoutGrid/>月历</button></div>
          <div className="date-nav"><button onClick={() => setCursor(view === 'hour' ? addDays(cursor, -1) : subMonths(cursor, 1))}><ChevronLeft/></button><button className="today" onClick={goToday}>今天</button><button onClick={() => setCursor(view === 'hour' ? addDays(cursor, 1) : addMonths(cursor, 1))}><ChevronRight/></button></div>
        </section>
        {view === 'hour' ? <HourView date={cursor} projects={filtered} onOpen={setActive}/> : <MonthView month={cursor} projects={filtered} onOpen={setActive}/>}
      </>}
    </main>
    {creating && <CreateProject
      onClose={() => setCreating(false)}
      onCreated={(p) => { setProjects((x) => [...x, p]); setCreating(false) }}
    />}
  </div>
}

function HourView({date, projects, onOpen}: {date: Date; projects: Project[]; onOpen: (p: Project) => void}) {
  const dayProjects = projects.filter((p) => {
    const start = parseISO(p.startAt); const due = p.dueAt ? parseISO(p.dueAt) : null
    return isSameDay(start, date) || Boolean(due && isWithinInterval(date, {start: new Date(start.setHours(0,0,0,0)), end: new Date(due.setHours(23,59,59,999))}))
  })
  const hours = Array.from({length: 24}, (_, i) => i)
  return <section className="hour-card">
    {dayProjects.length === 0 ? <Empty title="这一天没有安排" text="新建项目，或切换到其他日期查看。"/> : <div className="hour-scroll">
      <div className="hour-grid" style={{'--columns': dayProjects.length} as React.CSSProperties}>
        <div className="corner"/>{dayProjects.map((p) => <button key={p.id} className="project-head" onDoubleClick={() => onOpen(p)}><i style={{background:p.color}}/><span>{p.name}</span><small>{p.dueAt ? `${format(parseISO(p.dueAt), 'M/d HH:mm')} 截止` : '交付未定'}</small></button>)}
        <div className="times">{hours.map(h => <span key={h}>{String(h).padStart(2,'0')}:00</span>)}</div>
        {dayProjects.map((p) => <HourLane key={p.id} project={p} date={date} onOpen={() => onOpen(p)}/>) }
      </div>
    </div>}
  </section>
}

function HourLane({project, date, onOpen}: {project: Project; date: Date; onOpen: () => void}) {
  const start = parseISO(project.startAt); const due = project.dueAt ? parseISO(project.dueAt) : null
  const firstDay = isSameDay(start, date); const lastDay = due && isSameDay(due, date)
  const startHour = firstDay ? start.getHours() + start.getMinutes()/60 : 0
  const endHour = lastDay && due ? due.getHours() + due.getMinutes()/60 : due ? 24 : Math.min(startHour + 1.4, 24)
  const top = startHour * 64; const height = Math.max((endHour-startHour)*64, 52)
  return <div className="lane">{Array.from({length:24},(_,i)=><span key={i}/>)}<button className={`time-bubble ${!due ? 'open-ended' : ''}`} style={{top, height, '--bubble': project.color} as React.CSSProperties} onDoubleClick={onOpen} title={`${project.name}\n${format(start, 'M月d日 HH:mm')} 开始\n${due ? format(due, 'M月d日 HH:mm')+' 交付' : '交付日期未定'}`}><b>{project.name}</b><small>{firstDay ? format(start,'HH:mm') : '延续'} — {lastDay && due ? format(due,'HH:mm') : due ? '继续' : '未定'}</small></button></div>
}

function MonthView({month, projects, onOpen}: {month: Date; projects: Project[]; onOpen:(p:Project)=>void}) {
  const start = startOfWeek(startOfMonth(month), {weekStartsOn:1}); const end = endOfWeek(endOfMonth(month), {weekStartsOn:1}); const days = eachDayOfInterval({start,end})
  return <section className="month-card"><div className="weekdays">{'一二三四五六日'.split('').map(d=><span key={d}>周{d}</span>)}</div><div className="month-grid">{days.map(day => {
    const visible = projects.filter(p => { const s=parseISO(p.startAt); const e=p.dueAt?parseISO(p.dueAt):end; return isWithinInterval(day,{start:new Date(s.getFullYear(),s.getMonth(),s.getDate()),end:new Date(e.getFullYear(),e.getMonth(),e.getDate())}) }).slice(0,3)
    return <div className={`day ${!isSameMonth(day,month)?'muted':''} ${isSameDay(day,new Date())?'today-day':''}`} key={dateKey(day)}><span className="day-num">{format(day,'d')}</span><div className="day-items">{visible.map(p => { const starts=isSameDay(day,parseISO(p.startAt)); const ends=p.dueAt&&isSameDay(day,parseISO(p.dueAt)); return <button key={p.id} onDoubleClick={()=>onOpen(p)} title={`${p.name}\n${p.description}\n${p.dueAt?'交付 '+format(parseISO(p.dueAt),'M月d日 HH:mm'):'交付日期未定'}`} className={`month-pill ${!p.dueAt?'undated':''} ${starts?'starts':''} ${ends?'ends':''}`} style={{'--bubble':p.color} as React.CSSProperties}><span>{starts ? p.name : `↪ ${p.name}`}</span>{!p.dueAt&&<em>{starts?'持续中':'未定交付'}</em>}</button>})}{projects.filter(p => {const s=parseISO(p.startAt);const e=p.dueAt?parseISO(p.dueAt):end;const rangeStart=new Date(s.getFullYear(),s.getMonth(),s.getDate());const rangeEnd=new Date(e.getFullYear(),e.getMonth(),e.getDate());return isWithinInterval(day,{start:rangeStart,end:rangeEnd})}).length>3&&<small className="more">+ 更多</small>}</div></div>
  })}</div></section>
}

function ProjectPage({project,onBack,onChanged}:{project:Project;onBack:()=>void;onChanged:()=>void}) {
  const [status,setStatus]=useState<ProjectStatus>(project.status)
  const importFile=async(cat:FileCategory)=>{await window.eazyflow.importFiles(project.id,cat);await onChanged()}
  const changeStatus=async(s:ProjectStatus)=>{setStatus(s);await window.eazyflow.updateProject(project.id,{status:s});onChanged()}
  return <div className="project-page"><header className="project-top"><button className="back" onClick={onBack}><ChevronLeft/>返回时间表</button><button className="ghost"><MoreHorizontal/></button></header><section className="project-hero"><div className="project-title"><i style={{background:project.color}}/><div><p className="eyebrow">项目工作区</p><h1>{project.name}</h1><p>{project.description||'暂无项目说明'}</p></div></div><div className="project-meta"><label>状态<select value={status} onChange={e=>changeStatus(e.target.value as ProjectStatus)}>{['未开始','进行中','已完成','已归档'].map(s=><option key={s}>{s}</option>)}</select></label><div><span>开始</span><b>{format(parseISO(project.startAt),'yyyy年M月d日 HH:mm')}</b></div><div><span>交付</span><b>{project.dueAt?format(parseISO(project.dueAt),'yyyy年M月d日 HH:mm'):'暂未确定'}</b></div></div></section><div className="file-grid">{categories.map(c=><FileSection key={c.id} category={c} files={project.files.filter(f=>f.category===c.id)} onImport={()=>importFile(c.id)} onOpen={(f)=>window.eazyflow.openFile(project.id,f.id)} onReveal={(f)=>window.eazyflow.revealFile(project.id,f.id)} onDelete={async(f)=>{if(confirm(`确定从项目中删除“${f.name}”吗？`)){await window.eazyflow.deleteFile(project.id,f.id);onChanged()}}}/>)}</div></div>
}

function FileSection({category,files,onImport,onOpen,onReveal,onDelete}:{category:typeof categories[number];files:ProjectFile[];onImport:()=>void;onOpen:(f:ProjectFile)=>void;onReveal:(f:ProjectFile)=>void;onDelete:(f:ProjectFile)=>void}){
  const Icon=category.icon; return <section className="file-section"><div className="file-heading"><div className="file-heading-icon"><Icon/></div><div><h3>{category.label}<span>{files.length}</span></h3><p>{category.hint}</p></div><button onClick={onImport}><Plus/>添加</button></div><div className="file-list">{files.length===0?<button className="drop-hint" onClick={onImport}><Upload/><span>复制文件到此分类</span></button>:files.map(f=><div className="file-row" key={f.id} onDoubleClick={()=>onOpen(f)}><div className="file-type">{f.extension.replace('.','').slice(0,4)||'FILE'}</div><div className="file-info"><b>{f.name}</b><small>{bytes(f.size)} · {format(parseISO(f.createdAt),'M月d日 HH:mm')}</small></div><button title="打开所在位置" onClick={()=>onReveal(f)}><FolderOpen/></button><button className="danger" title="删除" onClick={()=>onDelete(f)}><Trash2/></button></div>)}</div></section>
}

function CreateProject({onClose,onCreated}:{onClose:()=>void;onCreated:(p:Project)=>void}){
  const [name,setName]=useState('');const [description,setDescription]=useState('');const [start,setStart]=useState(toLocalInput(new Date().toISOString()));const [due,setDue]=useState('');const [color,setColor]=useState(colors[0]);const [saving,setSaving]=useState(false)
  const valid=Boolean(name.trim()&&start&&(!due||new Date(due)>new Date(start)))
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!valid)return;setSaving(true);const p=await window.eazyflow.createProject({name:name.trim(),description:description.trim(),color,status:'未开始',startAt:new Date(start).toISOString(),...(due?{dueAt:new Date(due).toISOString()}:{})});onCreated(p)}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">创建工作空间</p><h2>新建项目</h2></div><button type="button" onClick={onClose}><X/></button></div><label>项目名称<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="例如：品牌视觉提案"/></label><label>项目说明<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="简单记录任务目标或背景（选填）"/></label><div className="form-row"><label>开始时间<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>交付时间 <small>可不填</small><input type="datetime-local" value={due} min={start} onChange={e=>setDue(e.target.value)}/></label></div><label>识别颜色<div className="color-row">{colors.map(c=><button type="button" className={color===c?'picked':''} style={{background:c}} key={c} onClick={()=>setColor(c)}/>)}</div></label>{due&&new Date(due)<=new Date(start)&&<p className="error">交付时间需要晚于开始时间</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!valid||saving}>{saving?'创建中…':'创建项目'}</button></div></form></div>
}

function Empty({title,text}:{title:string;text:string}){return <div className="empty"><CalendarDays/><h3>{title}</h3><p>{text}</p></div>}
export default App
