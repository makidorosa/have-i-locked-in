"use client";

import { useEffect, useRef, useState } from "react";

type Task = { id: string; title: string; minutes: number; seconds: number; done: boolean; createdDay: string; course?: string };
type History = Record<string, boolean>;
type Recurring = { id: string; title: string; minutes: number; weekdays: number[]; createdDay: string; course?: string };
type Exam = { id: string; title: string; date: string; course: string };
type PersonalEvent = { id: string; title: string; date: string; notes: string };
type Course = { id:string; code:string; name:string; location:string; meetings: { id:string; weekday:number; start:string; end:string }[] };
type ClassStatus = "attended" | "flanked" | "excused";
type ScheduledItem = { id:string; title:string; date:string; start:string; end:string; notes:string };
type RunningTimer = { id: string; startedAt: number; baseSeconds: number };
type State = { timer?: RunningTimer | null; courses:Course[]; classStatuses:Record<string,ClassStatus>; scheduleItems:ScheduledItem[]; version: 1; tasks: Task[]; history: History; bestStreak: number; punishment: string | null; lastPunishmentDay: string | null; recurring: Recurring[]; exams: Exam[]; events: PersonalEvent[] };
const KEY = "have-i-locked-in-v1";
const punishments = ["Complete 5 extra practice problems", "Review 15 flashcards", "Write a 150-word lecture summary", "Correct three old mistakes", "Study one difficult concept for 20 minutes"];
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
// A running session belongs to the day on which it started. Never credit time after that day's midnight.
const timerEnd = (startedAt:number) => { const d=new Date(startedAt); return new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime(); };
const creditedSeconds = (timer:RunningTimer, at:number, goalMinutes:number) => Math.min(86400,Math.max(0,goalMinutes*60),timer.baseSeconds+Math.max(0,Math.floor((Math.min(at,timerEnd(timer.startedAt))-timer.startedAt)/1000)));
const previousDay = (key: string) => { const [y,m,d] = key.split("-").map(Number); return dayKey(new Date(y,m-1,d-1)); };
const initial = (): State => ({ timer:null, version: 1, tasks: [], history: {}, bestStreak: 0, punishment: null, lastPunishmentDay: null, recurring: [], exams: [], events: [], courses: [], classStatuses: {}, scheduleItems: [] });
const daysBetween = (start: string, end: string) => { const [y,m,d] = start.split("-").map(Number); const [ey,em,ed] = end.split("-").map(Number); return Math.round((Date.UTC(ey,em-1,ed)-Date.UTC(y,m-1,d))/86400000); };
const shiftDay = (key: string, offset: number) => { const [y,m,d] = key.split("-").map(Number); return new Date(Date.UTC(y,m-1,d+offset)).toISOString().slice(0,10); };
const weekday = (key: string) => { const [y,m,d] = key.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)).getUTCDay(); };
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const fmt = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2,"0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
function streak(history: History, today: string) {
  let cursor = history[today] === true ? today : previousDay(today);
  let count = 0;
  while (history[cursor] === true && count < 10000) { count++; cursor = previousDay(cursor); }
  return count;
}
function normalize(raw: unknown): State {
  if (!raw || typeof raw !== "object") throw new Error("Invalid backup");
  const v = raw as Partial<State>;
  if (v.version !== 1 || !Array.isArray(v.tasks) || !v.history || typeof v.history !== "object") throw new Error("Unsupported backup format");
  const tasks = v.tasks.map((t) => {
    if (!t || typeof t.id !== "string" || typeof t.title !== "string" || typeof t.createdDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.createdDay)) throw new Error("Invalid task in backup");
    return { id: t.id, title: t.title.slice(0,120), minutes: Math.max(0,Math.min(1440,Math.floor(Number(t.minutes)||0))), seconds: Math.max(0,Math.min(86400,Math.floor(Number(t.seconds)||0))), done: Boolean(t.done), createdDay: t.createdDay, course: typeof t.course === "string" ? t.course.slice(0,80) : "" };
  });
  const history: History = {};
  for (const [key,val] of Object.entries(v.history)) if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof val === "boolean") history[key] = val;
  const exams: Exam[] = Array.isArray(v.exams) ? v.exams.filter((e): e is Exam => !!e && typeof e.id === "string" && typeof e.title === "string" && typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date)).map(e=>({id:e.id,title:e.title.slice(0,120),date:e.date,course:typeof e.course === "string"?e.course.slice(0,80):""})) : [];
  const events: PersonalEvent[] = Array.isArray(v.events) ? v.events.filter((e): e is PersonalEvent => !!e && typeof e.id === "string" && typeof e.title === "string" && typeof e.date === "string" && isValidDate(e.date)).map(e=>({id:e.id,title:e.title.slice(0,120),date:e.date,notes:typeof e.notes==="string"?e.notes.slice(0,500):""})) : [];
  const courses: Course[] = Array.isArray(v.courses) ? v.courses.filter((c):c is Course=>!!c&&typeof c.id==="string"&&typeof c.code==="string"&&Array.isArray(c.meetings)).map(c=>({id:c.id,code:c.code.slice(0,80),name:String(c.name||"").slice(0,120),location:String(c.location||"").slice(0,120),meetings:c.meetings.filter(m=>m&&typeof m.id==="string"&&Number.isInteger(m.weekday)&&m.weekday>=0&&m.weekday<=6&&validClock(m.start)&&validClock(m.end)&&m.end>m.start).map(m=>({id:m.id,weekday:m.weekday,start:m.start,end:m.end}))})) : [];
  const classStatuses:Record<string,ClassStatus>={};
  if(v.classStatuses&&typeof v.classStatuses==="object")for(const [key,status] of Object.entries(v.classStatuses))if(["attended","flanked","excused"].includes(String(status)))classStatuses[key]=status as ClassStatus;
  const scheduleItems:ScheduledItem[]=Array.isArray(v.scheduleItems)?v.scheduleItems.filter((x):x is ScheduledItem=>!!x&&typeof x.id==="string"&&typeof x.title==="string"&&isValidDate(x.date)&&(!x.start||validClock(x.start))&&(!x.end||validClock(x.end))).map(x=>({id:x.id,title:x.title.slice(0,120),date:x.date,start:x.start||"",end:x.end||"",notes:String(x.notes||"").slice(0,500)})):[];
  const rawTimer=v.timer;
  const timer:RunningTimer|null=rawTimer && typeof rawTimer.id==="string" && Number.isFinite(rawTimer.startedAt) && rawTimer.startedAt>0 && Number.isFinite(rawTimer.baseSeconds)
    && tasks.some(t=>t.id===rawTimer.id && !t.done && t.minutes>0 && t.createdDay===dayKey(new Date(rawTimer.startedAt)))
    ? {id:rawTimer.id,startedAt:rawTimer.startedAt,baseSeconds:Math.max(0,Math.min(86400,Math.floor(rawTimer.baseSeconds)))} : null;
  return { timer,courses,classStatuses,scheduleItems,version:1, tasks, history, exams, events, bestStreak:Math.max(0,Math.floor(Number(v.bestStreak)||0)), punishment: typeof v.punishment === "string" ? v.punishment.slice(0,200) : null, lastPunishmentDay: typeof v.lastPunishmentDay === "string" ? v.lastPunishmentDay : null,
    recurring: Array.isArray(v.recurring) ? v.recurring.filter((r): r is Recurring => !!r && typeof r.id === "string" && typeof r.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.createdDay) && Array.isArray(r.weekdays)).map(r=>({id:r.id,title:r.title.slice(0,120),minutes:Math.max(0,Math.min(1440,Math.floor(Number(r.minutes)||0))),createdDay:r.createdDay,course:typeof r.course === "string" ? r.course.slice(0,80) : "",weekdays:r.weekdays.filter(d=>Number.isInteger(d)&&d>=0&&d<=6)})) : [] };
}
const validClock=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const clockMinutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
const LOCK_MONTHS=["Janulock","Februgrind","March Madness","Aprillocked","Mayhem","Junelock","Julock","Augrind","Septemgrind","Locktober","Novemgrind","Decemgrind"];
const ordinal=(n:number)=>`${n}${[11,12,13].includes(n%100)?"th":n%10===1?"st":n%10===2?"nd":n%10===3?"rd":"th"}`;
const isValidDate=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split("-").map(Number);const candidate=new Date(Date.UTC(y,m-1,d));return candidate.getUTCFullYear()===y&&candidate.getUTCMonth()===m-1&&candidate.getUTCDate()===d;};
const monthGrid=(date:Date)=>{const y=date.getFullYear(),m=date.getMonth();const first=new Date(y,m,1).getDay();const last=new Date(y,m+1,0).getDate();return Array.from({length:Math.ceil((first+last)/7)*7},(_,i)=>{const day=i-first+1;return day>0&&day<=last?dayKey(new Date(y,m,day)):null;});};
function parseCSV(text:string){const rows:string[][]=[];let row:string[]=[],value="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===","&&!quoted){row.push(value);value="";}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value="";}else value+=c;}row.push(value);if(row.some(x=>x.trim()))rows.push(row);return rows;}
export default function LockInDashboard() {
  const [data,setData] = useState<State>(initial);
  const [ready,setReady] = useState(false);
  const [today,setToday] = useState("1970-01-01");
  const [title,setTitle] = useState("");
  const [minutes,setMinutes] = useState("30");
  const [repeat,setRepeat] = useState("none");
  const [taskCourse,setTaskCourse] = useState("");
  const [tab,setTab] = useState<"home" | "planner" | "schedule">("home");
  const [scheduleView,setScheduleView]=useState<"day"|"week"|"month"|"year">("day");
  const [scheduleDate,setScheduleDate]=useState("1970-01-01");
  const [courseCode,setCourseCode]=useState("");
  const [courseName,setCourseName]=useState("");
  const [courseLocation,setCourseLocation]=useState("");
  const [meetingDays,setMeetingDays]=useState<number[]>([1,3,5]);
  const [meetingStart,setMeetingStart]=useState("09:00");
  const [meetingEnd,setMeetingEnd]=useState("09:50");
  const [scheduleTitle,setScheduleTitle]=useState("");
  const [scheduleStart,setScheduleStart]=useState("");
  const [scheduleEnd,setScheduleEnd]=useState("");
  const [scheduleNotes,setScheduleNotes]=useState("");
  const [realityCardIndex,setRealityCardIndex] = useState(0);
  const realitySwipeStartX = useRef<number | null>(null);
  const [showFailure,setShowFailure] = useState(false);
  const [taskKind,setTaskKind] = useState<"assignment" | "checklist">("assignment");
  const [viewMonth,setViewMonth] = useState(() => new Date(1970, 0, 1));
  const [examTitle,setExamTitle] = useState("");
  const [examCourse,setExamCourse] = useState("");
  const [examDate,setExamDate] = useState("");
  const [eventTitle,setEventTitle] = useState("");
  const [eventDate,setEventDate] = useState("");
  const [eventNotes,setEventNotes] = useState("");
  const examFileRef=useRef<HTMLInputElement>(null);
  const [active,setActive] = useState<string | null>(null);
  const [message,setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<{ id:string; startedAt:number; baseSeconds:number } | null>(null);
  const [now,setNow] = useState(0);
  useEffect(() => { const current = new Date(); setToday(dayKey(current)); setScheduleDate(dayKey(current)); setViewMonth(new Date(current.getFullYear(), current.getMonth(), 1)); setNow(current.getTime()); try { const raw = localStorage.getItem(KEY); if (raw) {
    const restored=normalize(JSON.parse(raw));
    if(restored.timer){
      const t=restored.timer;
      const task=restored.tasks.find(x=>x.id===t.id);
      if(task && dayKey(new Date())===task.createdDay && Date.now()<timerEnd(t.startedAt)){
        timerRef.current=t; setActive(t.id);
      }else{
        // The session expired while the app was closed. Preserve earned seconds, but don't continue into another day.
        restored.tasks=restored.tasks.map(x=>x.id===t.id?{...x,seconds:creditedSeconds(t,Date.now(),x.minutes)}:x);
        restored.timer=null;
      }
    }
    setData(restored);
  } } catch { setMessage("Saved data could not be loaded. You can restore a backup."); } setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY,JSON.stringify(data)); }, [data,ready]);
  useEffect(() => { const id = window.setInterval(() => { setNow(Date.now()); setToday(dayKey(new Date())); },1000); return () => clearInterval(id); }, []);
  // Reconcile days, including skipped dates when the app wasn't opened.
  useEffect(() => {
    if (!ready || today === "1970-01-01") return;
    setData(prev => {
      const changed = {...prev, history:{...prev.history},tasks:[...prev.tasks]};
      const earliest = [...prev.tasks.map(t=>t.createdDay),...prev.recurring.map(r=>r.createdDay)].sort()[0] || today;
      const span = Math.max(0,Math.min(366,daysBetween(earliest,today)));
      let failedDay: string | null = null;
      for(let i=0;i<=span;i++) {
        const key=shiftDay(today,-span+i);
        const applicable=prev.recurring.filter(r=>r.createdDay<=key&&r.weekdays.includes(weekday(key)));
        for(const r of applicable) {
          if (!changed.tasks.some(t=>t.createdDay===key&&t.id===`${r.id}:${key}`)) changed.tasks.push({id:`${r.id}:${key}`,title:r.title,minutes:r.minutes,course:r.course,seconds:0,done:false,createdDay:key});
        }
        if (key===today || Object.prototype.hasOwnProperty.call(changed.history,key)) continue;
        const dayTasks=changed.tasks.filter(t=>t.createdDay===key);
        if(!dayTasks.length) continue;
        const success=dayTasks.every(t=>t.done);
        changed.history[key]=success;
        if(!success) failedDay=key;
      }
      if(failedDay && failedDay!==prev.lastPunishmentDay) {
        changed.punishment=punishments[Math.floor(Math.random()*punishments.length)];
        changed.lastPunishmentDay=failedDay;
      }
      let chain=0, best=prev.bestStreak;
      for(const key of Object.keys(changed.history).sort()) { if(changed.history[key]) {chain=changed.history[previousDay(key)]?chain+1:1; best=Math.max(best,chain);} else chain=0; }
      changed.bestStreak=best;
      return JSON.stringify(changed)===JSON.stringify(prev)?prev:changed;
    });
  },[ready,today]);
  useEffect(()=>{ if(ready && data.lastPunishmentDay && data.lastPunishmentDay!==today && data.history[data.lastPunishmentDay]===false) setShowFailure(localStorage.getItem("lock-in-failure-dismissed") !== data.lastPunishmentDay); },[ready,data.lastPunishmentDay,today]);
  const courseMeetingInstances=(date:string)=>data.courses.flatMap(course=>course.meetings.filter(m=>m.weekday===weekday(date)).map(m=>({course,meeting:m,date,key:`${date}:${m.id}`,status:data.classStatuses[`${date}:${m.id}`]})));
  const setMeetingStatus=(date:string,meetingId:string,course:Course,start:string,end:string,status:ClassStatus|"scheduled")=>{
    if(date!==today){setMessage("Attendance changes are available for today only, to keep the streak history accurate.");return;}
    const key=`${date}:${meetingId}`;
    const taskId=`flank:${key}`;
    const duration=Math.max(1,clockMinutes(end)-clockMinutes(start));
    const previous=data.classStatuses[key];
    if(previous==="flanked"&&status!=="flanked"&&!window.confirm(`Undo the flank and remove its ${duration}-minute recovery task?`))return;
    if(active===taskId)stopTimer();
    setData(prev=>{
      const classStatuses={...prev.classStatuses};
      if(status==="scheduled")delete classStatuses[key];else classStatuses[key]=status;
      const tasks=prev.tasks.filter(t=>t.id!==taskId);
      if(status==="flanked")tasks.push({id:taskId,title:`${course.code} — Flank Recovery`,course:course.code,minutes:duration,seconds:0,done:false,createdDay:date});
      return {...prev,classStatuses,tasks,timer:prev.timer?.id===taskId&&status!=="flanked"?null:prev.timer};
    });
    setMessage(status==="flanked"?`${duration}-minute recovery task created in Planner. Due today.`:status==="attended"?"Class marked attended.":status==="excused"?"Class marked excused. No recovery required.":"Class status reset.");
  };
  const createCourse=(event:React.FormEvent)=>{event.preventDefault();const code=courseCode.trim().toUpperCase();if(!code||!validClock(meetingStart)||!validClock(meetingEnd)||meetingEnd<=meetingStart||meetingDays.length===0){setMessage("Enter a course code, valid times, and at least one weekday.");return;}
    if(data.courses.some(c=>c.code.toLowerCase()===code.toLowerCase())){setMessage("That course already exists. Add another meeting to the existing course instead.");return;}
    setData(prev=>({...prev,courses:[...prev.courses,{id:uid(),code,name:courseName.trim(),location:courseLocation.trim(),meetings:meetingDays.map(weekday=>({id:uid(),weekday,start:meetingStart,end:meetingEnd}))}]}));setCourseCode("");setCourseName("");setCourseLocation("");setMessage("Course added to your timetable.");
  };
  const deleteCourse=(course:Course)=>{if(!confirm(`Delete ${course.code} and its class meetings? Existing recovery tasks will remain.`))return;setData(prev=>({...prev,courses:prev.courses.filter(c=>c.id!==course.id)}));};
  const addMeeting=(courseId:string)=>{if(!validClock(meetingStart)||!validClock(meetingEnd)||meetingEnd<=meetingStart||!meetingDays.length){setMessage("Choose days and valid start/end times.");return;}setData(prev=>({...prev,courses:prev.courses.map(c=>c.id===courseId?{...c,meetings:[...c.meetings,...meetingDays.map(weekday=>({id:uid(),weekday,start:meetingStart,end:meetingEnd}))]}:c)}));};
  const addScheduledItem=(event:React.FormEvent)=>{event.preventDefault();const name=scheduleTitle.trim();if(!name||!isValidDate(scheduleDate)||Boolean(scheduleStart)!==Boolean(scheduleEnd)||(scheduleStart&&(!validClock(scheduleStart)||!validClock(scheduleEnd)||scheduleEnd<=scheduleStart))){setMessage("Enter a title and either no time or a valid start/end time.");return;}setData(prev=>({...prev,scheduleItems:[...prev.scheduleItems,{id:uid(),title:name,date:scheduleDate,start:scheduleStart,end:scheduleEnd,notes:scheduleNotes.trim()}]}));setScheduleTitle("");setScheduleStart("");setScheduleEnd("");setScheduleNotes("");setMessage("Schedule item added.");};
  const removeScheduledItem=(item:ScheduledItem)=>{if(!confirm(`Delete scheduled item “${item.title}”?`))return;setData(prev=>({...prev,scheduleItems:prev.scheduleItems.filter(x=>x.id!==item.id)}));};
  const calendarForDay=(date:string)=>{
    const meetings=courseMeetingInstances(date).map(({course,meeting,status,key})=>({id:key,title:course.code,detail:course.name||course.location||"Class",start:meeting.start,end:meeting.end,type:"class" as const,course,meeting,status}));
    const items=data.scheduleItems.filter(x=>x.date===date).map(x=>({id:x.id,title:x.title,detail:x.notes,start:x.start,end:x.end,type:"event" as const,item:x}));
    return [...meetings,...items].sort((a,b)=>(a.start||"00:00").localeCompare(b.start||"00:00"));
  };
  const examsOnScheduleDate = data.exams.filter(e => e.date === scheduleDate);
  const personalEventsOnScheduleDate = data.events.filter(e => e.date === scheduleDate);
  const tasksOnScheduleDate = data.tasks.filter(t => t.createdDay === scheduleDate);
  const openCalendarDay = (date: string) => {
    setScheduleDate(date);
    setScheduleView("day");
    setTab("schedule");
  };
  const weekAnchor=shiftDay(scheduleDate,-((weekday(scheduleDate)+6)%7));
  const scheduleWeek=Array.from({length:7},(_,i)=>shiftDay(weekAnchor,i));
  const scheduleMonthDate=new Date(Number(scheduleDate.slice(0,4)),Number(scheduleDate.slice(5,7))-1,1);
  const scheduleMonthDays=monthGrid(scheduleMonthDate);
  const navSchedule=(delta:number)=>{const d=new Date(Number(scheduleDate.slice(0,4)),Number(scheduleDate.slice(5,7))-1,Number(scheduleDate.slice(8)));if(scheduleView==="day")d.setDate(d.getDate()+delta);else if(scheduleView==="week")d.setDate(d.getDate()+7*delta);else if(scheduleView==="month")d.setMonth(d.getMonth()+delta);else d.setFullYear(d.getFullYear()+delta);setScheduleDate(dayKey(d));};
  const todayTasks = data.tasks.filter(t=>t.createdDay===today);
  const liveSeconds = (task: Task) => active===task.id && timerRef.current?.id===task.id ? creditedSeconds(timerRef.current,now,task.minutes) : task.seconds;
  const stopTimer = () => {
    const timer = timerRef.current;
    if (!timer) return;
    setData(prev=>({...prev,timer:null,tasks:prev.tasks.map(t=>t.id===timer.id?{...t,seconds:creditedSeconds(timer,Date.now(),t.minutes)}:t)}));
    timerRef.current=null; setActive(null);
  };
  useEffect(() => {
    const timer=timerRef.current;
    if (ready && timer && today!=="1970-01-01" && dayKey(new Date(timer.startedAt))!==today) stopTimer();
  },[today,ready]);
  const startTimer = (task: Task) => {
    if (task.done || task.createdDay!==dayKey(new Date()) || task.minutes===0) return;
    const prior=timerRef.current;
    const timer:RunningTimer={id:task.id,startedAt:Date.now(),baseSeconds:task.seconds};
    timerRef.current=timer; setActive(task.id);
    setData(prev=>({...prev,timer,tasks:prior?prev.tasks.map(t=>t.id===prior.id?{...t,seconds:creditedSeconds(prior,Date.now(),t.minutes)}:t):prev.tasks}));
  };
  const addTask = (e: React.FormEvent) => {
    e.preventDefault(); const clean=title.trim(); const min=taskKind==="checklist"?0:Number(minutes);
    if (!clean || !Number.isInteger(min) || min<0 || min>1440) {setMessage("Enter a task and a whole number of minutes from 0 to 1440.");return;}
    setData(prev=>{
      const id=uid();
      const weekdays=repeat==="daily"?[0,1,2,3,4,5,6]:repeat==="weekdays"?[1,2,3,4,5]:[];
      const recurring=weekdays.length?[...prev.recurring,{id,title:clean,minutes:min,course:taskCourse.trim(),weekdays,createdDay:today}]:prev.recurring;
      const taskId=weekdays.length?`${id}:${today}`:id;
      return {...prev,recurring,tasks:[...prev.tasks,{id:taskId,title:clean,minutes:min,course:taskCourse.trim(),seconds:0,done:false,createdDay:today}]};
    }); setTitle("");setTaskCourse("");setMessage("");
  };
  const deleteTask = (task: Task) => {
    if(task.id.startsWith("flank:")){setMessage("Flank Recovery is mandatory. Change the class status in Schedule to undo it.");return;}
    if (!window.confirm(`Delete "${task.title}"? This removes it from today's goals.`)) return;
    if (active === task.id) stopTimer();
    setData(prev => ({...prev, timer:prev.timer?.id===task.id?null:prev.timer, tasks: prev.tasks.filter(t => t.id !== task.id),
      recurring: prev.recurring.filter(r=>`${r.id}:${task.createdDay}`!==task.id)}));
    setMessage(`Deleted "${task.title}".`);
  };
  const completeTask = (task: Task) => {
    if (liveSeconds(task)<task.minutes*60) return;
    if (active===task.id) { timerRef.current=null; setActive(null); }
    setData(prev=>({...prev,timer:prev.timer?.id===task.id?null:prev.timer,tasks:prev.tasks.map(t=>t.id===task.id?{...t,done:true,seconds:Math.max(t.seconds,task.minutes*60)}:t)}));
  };
  const download = () => {
    const timer=timerRef.current;
    const snapshot = timer ? {...data,timer,tasks:data.tasks.map(t=>t.id===timer.id?{...t,seconds:creditedSeconds(timer,Date.now(),t.minutes)}:t)} : data;
    const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=url;a.download=`have-i-locked-in-${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const importBackup = async (file?:File) => {
    if (!file) return;
    try { const incoming=normalize(JSON.parse(await file.text())); if (!confirm(`Replace your current data with ${incoming.tasks.length} saved tasks? Export your current data first if needed.`)) return; stopTimer();timerRef.current=null;setActive(null);if(incoming.timer){const t=incoming.timer;const task=incoming.tasks.find(x=>x.id===t.id);if(task&&task.createdDay===dayKey(new Date())&&Date.now()<timerEnd(t.startedAt)){timerRef.current=t;setActive(t.id);}else{incoming.tasks=incoming.tasks.map(x=>x.id===t.id?{...x,seconds:creditedSeconds(t,Date.now(),x.minutes)}:x);incoming.timer=null;}}setData(incoming);setMessage("Backup restored."); }
    catch { setMessage("Import failed: invalid or unsupported JSON backup."); }
    finally { if(fileRef.current) fileRef.current.value=""; }
  };
  const addExam=(event:React.FormEvent)=>{event.preventDefault();const name=examTitle.trim();if(!name || !isValidDate(examDate)){setMessage("Enter an exam name and valid date.");return;}setData(prev=>({...prev,exams:[...prev.exams,{id:uid(),title:name,date:examDate,course:examCourse.trim()}]}));setExamTitle("");setExamCourse("");setExamDate("");setMessage("Exam added.");};
  const addEvent=(event:React.FormEvent)=>{event.preventDefault();const name=eventTitle.trim();if(!name||!isValidDate(eventDate)){setMessage("Enter an event name and valid date.");return;}setData(prev=>({...prev,events:[...prev.events,{id:uid(),title:name,date:eventDate,notes:eventNotes.trim()}]}));setEventTitle("");setEventDate("");setEventNotes("");setMessage("Personal event added.");};
  const removeEvent=(item:PersonalEvent)=>{if(!window.confirm(`Remove event "${item.title}"?`))return;setData(prev=>({...prev,events:prev.events.filter(e=>e.id!==item.id)}));};
  const removeExam=(exam:Exam)=>{if(!window.confirm(`Remove exam "${exam.title}"?`))return;setData(prev=>({...prev,exams:prev.exams.filter(e=>e.id!==exam.id)}));};
  const importExams=async(file?:File)=>{
    if(!file)return;
    try{
      const raw=await file.text();let items:{title:string;date:string;course:string}[]=[];
      if(file.name.toLowerCase().endsWith(".ics")){
        // Unfold RFC 5545 continuation lines, then read event summaries and DTSTART.
        const lines=raw.replace(/\r\n[ \t]/g,"").replace(/\n[ \t]/g,"").split(/\r?\n/);
        let eventLines:string[]|null=null;
        for(const line of lines){if(line==="BEGIN:VEVENT")eventLines=[];else if(line==="END:VEVENT" && eventLines){
          const start=eventLines.find(x=>/^DTSTART(?:;[^:]*)?:/.test(x))?.split(":").slice(1).join(":")||"";
          const summary=eventLines.find(x=>x.startsWith("SUMMARY:"))?.slice(8).replace(/\\[,;]/g,m=>m.slice(1)).replace(/\\n/gi," ")||"";
          const digits=start.slice(0,8);const date=/^\d{8}$/.test(digits)?`${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`:"";
          if(summary.trim()&&isValidDate(date))items.push({title:summary.trim(),date,course:""});eventLines=null;
        }else if(eventLines)eventLines.push(line);}
      }else if(file.name.toLowerCase().endsWith(".csv")){
        const lines=parseCSV(raw);if(lines.length<2)throw new Error("CSV needs a header and data rows");
        const headings=lines[0].map(v=>v.toLowerCase().trim());const titleIndex=headings.findIndex(x=>["title","exam","name","summary"].includes(x));const dateIndex=headings.findIndex(x=>["date","exam date","start date"].includes(x));const courseIndex=headings.findIndex(x=>["course","class","subject"].includes(x));
        if(titleIndex<0||dateIndex<0)throw new Error("CSV needs title,date columns");
        items=lines.slice(1).map(row=>({title:(row[titleIndex]||"").trim(),date:(row[dateIndex]||"").trim(),course:courseIndex>=0?(row[courseIndex]||"").trim():""})).filter(e=>e.title&&isValidDate(e.date));
      }else throw new Error("Use .ics or .csv");
      if(items.length===0)throw new Error("No valid events found");
      const preview=items.slice(0,3).map(e=>`${e.date}: ${e.title}`).join("\n");
      if(!window.confirm(`Import ${items.length} event(s) as exams?\n\n${preview}${items.length>3?"\n...":""}\n\nImport only files containing exams; general calendars may include unrelated events.`))return;
      setData(prev=>({...prev,exams:[...prev.exams,...items.map(e=>({...e,id:uid(),title:e.title.slice(0,120),course:e.course.slice(0,80)}))]}));setMessage(`Imported ${items.length} exam(s).`);
    }catch(err){setMessage(`Exam import failed: ${err instanceof Error?err.message:"Invalid file"}`);}finally{if(examFileRef.current)examFileRef.current.value="";}
  };
  const calendarDays=monthGrid(viewMonth);
  const niceMonth=LOCK_MONTHS[new Date(Number(today.slice(0,4)),Number(today.slice(5,7))-1,1).getMonth()];
  const courseOptions=Array.from(new Set([...data.exams.map(e=>e.course.trim()),...data.courses.map(c=>c.code)].filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const upcomingExams=[...data.exams].filter(e=>daysBetween(today,e.date)>=0).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
  const nextExam=upcomingExams[0];
  const realityIndex=upcomingExams.length ? realityCardIndex % upcomingExams.length : 0;
  const realityExam=upcomingExams[realityIndex];
  const moveRealityCard=(delta:number)=>setRealityCardIndex(index=>upcomingExams.length?(index+delta+upcomingExams.length)%upcomingExams.length:0);
  const daysUntil=nextExam?daysBetween(today,nextExam.date):null;
  const dailyGreeting=`It's the ${ordinal(Number(today.slice(8)))} of ${niceMonth}. ${nextExam?daysUntil===0?`${nextExam.title} is TODAY. Lock in twin.`:`${nextExam.title} is ${daysUntil} day${daysUntil===1?"":"s"} away. Lock in twin.`:"Lock in twin."}`;
  const done = todayTasks.filter(t=>t.done).length;
  const allDone = todayTasks.length>0 && done===todayTasks.length;
  const currentStreak=streak({...data.history,...(allDone?{[today]:true}:{})},today);
  const weekStart=shiftDay(today,-((weekday(today)+6)%7));
  const weekDays=Array.from({length:7},(_,i)=>shiftDay(weekStart,i));
  const nextSevenDays=Array.from({length:7},(_,i)=>shiftDay(today,i));
  const projected=(key:string)=>{
    const tasks=data.tasks.filter(t=>t.createdDay===key);
    const repeating=data.recurring.filter(r=>r.createdDay<=key&&r.weekdays.includes(weekday(key))&&!tasks.some(t=>t.id===`${r.id}:${key}`));
    return {tasks, repeating, total:tasks.length+repeating.length, done:tasks.filter(t=>t.done).length};
  };
  const recordedStudy=(exam:Exam)=>{
    const tags=[exam.course.trim().toLowerCase(),exam.title.trim().toLowerCase()].filter(Boolean);
    const relevant=data.tasks.filter(t=>t.minutes>0&&t.createdDay<=exam.date&&t.createdDay>=shiftDay(today,-30)&&tags.some(tag=> (t.course||"").toLowerCase()===tag || t.title.toLowerCase().includes(tag)));
    return relevant.reduce((sum,t)=>sum+t.seconds,0)+(active&&relevant.some(t=>t.id===active)&&timerRef.current?Math.max(0,Math.floor((now-timerRef.current.startedAt)/1000)):0);
  };
  const datePhrase=`It's the ${ordinal(Number(today.slice(8)))} of ${niceMonth}.`;
  const realityDays=realityExam?daysBetween(today,realityExam.date):null;
  const realityStudy=realityExam?recordedStudy(realityExam):0;
  const headline= !realityExam
    ? allDone?"YOU LOCKED IN. Nature is healing.":"Are you locked in, twin?"
    : realityDays===0
      ? realityStudy<60?`YOUR ${realityExam.title.toUpperCase()} IS TODAY. LESS THAN ONE MINUTE LOGGED. WE ARE IN THE TRENCHES.`:`${realityExam.title} is TODAY. Time to cash in that studying.`
      : realityDays!==null&&realityDays<=2&&realityStudy<60
        ? `${realityExam.title} is in ${realityDays} day${realityDays===1?"":"s"}. You have barely logged any study time for it. C's get degrees. F's do not.`
        : realityDays!==null&&realityDays<=5&&realityStudy<1800
          ? `${realityExam.title} is ${realityDays} days away. Your recorded prep is looking suspiciously empty.`
          : `${realityExam.title} is ${realityDays} days away. Keep the momentum, twin.`;
  const totalWeekPlanned=nextSevenDays.reduce((n,key)=>n+projected(key).total,0);
  const weekStudySeconds=data.tasks.filter(t=>t.minutes>0&&weekDays.includes(t.createdDay)).reduce((sum,t)=>sum+t.seconds,0);
  return <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8"><div className="mx-auto max-w-xl space-y-6">
    <header className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold tracking-[.22em] text-lime-400">PERSONAL EDITION · v0.8</p><h1 className="text-3xl font-black tracking-tight mt-1">HAVE I LOCKED IN?</h1><p className="text-zinc-400 text-sm mt-1">Your academic accountability department.</p></div><div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-center shrink-0"><div className="text-3xl font-black">🔥 {currentStreak}</div><div className="text-xs text-zinc-400">day streak</div></div></header>
    <nav aria-label="Main pages" className="grid grid-cols-3 gap-2 rounded-2xl bg-zinc-900 border border-zinc-800 p-1.5">{([ ["home","⌂ Home"],["planner","✎ Planner"],["schedule","▦ Schedule"]] as const).map(([value,label])=><button key={value} aria-current={tab===value?"page":undefined} className={`rounded-xl py-3 text-sm font-bold ${tab===value?"bg-lime-400 text-zinc-950":"text-zinc-400 hover:text-white"}`} onClick={()=>setTab(value)}>{label}</button>)}</nav>
    {tab==="home"&&<div className="space-y-5">
      <section className="rounded-3xl border border-lime-400/30 bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950/40 p-6" aria-label="Daily reality check carousel">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[.2em] text-lime-400 font-bold">Your daily reality check</p>
          {upcomingExams.length>1&&<span className="text-xs text-zinc-400 tabular-nums">{realityIndex+1} of {upcomingExams.length} exams</span>}
        </div>
        <p className="text-zinc-300 mt-4">{datePhrase}</p>
        <div key={realityExam?.id||"no-exam"} onTouchStart={event=>{realitySwipeStartX.current=event.touches[0]?.clientX??null;}} onTouchEnd={event=>{if(realitySwipeStartX.current===null)return;const dx=(event.changedTouches[0]?.clientX??realitySwipeStartX.current)-realitySwipeStartX.current;realitySwipeStartX.current=null;if(Math.abs(dx)>45&&upcomingExams.length>1)moveRealityCard(dx<0?1:-1);}}>
          {realityExam&&<div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-xs font-bold text-lime-300">{realityExam.course||"Exam"}</span>
            <span className="text-xs text-zinc-400">{realityExam.date} · {realityDays===0?"TODAY":`${realityDays} day${realityDays===1?"":"s"} left`}</span>
          </div>}
          <h2 className="text-2xl md:text-3xl font-black leading-tight mt-3" aria-live="polite">{headline}</h2>
          <p className="text-sm text-zinc-400 mt-4">{realityExam?`${realityExam.title} · ${Math.floor(realityStudy/60)} recorded study minutes linked to this exam in the last 30 days.`:"No upcoming exams on file. Suspiciously peaceful."}</p>
        </div>
        {upcomingExams.length>1&&<div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={()=>moveRealityCard(-1)} aria-label="Previous reality check" className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-lg font-bold hover:bg-zinc-700">←</button>
          <div className="flex flex-wrap justify-center gap-2" aria-label="Select a reality check">
            {upcomingExams.map((exam,i)=><button key={exam.id} type="button" onClick={()=>setRealityCardIndex(i)} aria-label={`Reality check for ${exam.title}`} aria-current={i===realityIndex?"true":undefined} className={`h-2.5 rounded-full transition-all ${i===realityIndex?"w-7 bg-lime-400":"w-2.5 bg-zinc-600 hover:bg-zinc-400"}`}/>) }
          </div>
          <button type="button" onClick={()=>moveRealityCard(1)} aria-label="Next reality check" className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-lg font-bold hover:bg-zinc-700">→</button>
        </div>}
        {upcomingExams.length>1&&<p className="text-xs text-zinc-500 text-center mt-2">Swipe to see the reality check for every exam, even ones on the same date.</p>}
        <button onClick={()=>setTab("planner")} className="mt-5 rounded-xl bg-lime-400 text-zinc-950 font-bold px-5 py-3">{realityExam?"I'M LOCKING IN →":"OPEN MY TASKS →"}</button>
      </section>
      <section className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs text-zinc-400">TODAY</p><p className="text-3xl font-black mt-1">{done}<span className="text-base text-zinc-500"> / {todayTasks.length}</span></p><p className="text-xs mt-1 text-zinc-400">tasks complete</p></div><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs text-zinc-400">THIS WEEK</p><p className="text-3xl font-black mt-1">{Math.round(weekStudySeconds/60)}<span className="text-base text-zinc-500"> min</span></p><p className="text-xs mt-1 text-zinc-400">recorded study time</p></div></section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex justify-between gap-3 items-center"><h2 className="font-bold text-lg">The week ahead</h2><span className="text-xs text-zinc-400">{totalWeekPlanned} tasks scheduled</span></div><div className="grid grid-cols-7 gap-1.5 mt-5">{nextSevenDays.map(key=>{const snap=projected(key);const exams=data.exams.filter(e=>e.date===key);const events=data.events.filter(e=>e.date===key);const classes=courseMeetingInstances(key);return <div key={key} className={`min-w-0 rounded-xl px-1 py-3 text-center border ${key===today?"border-lime-400 bg-lime-400/10":"border-zinc-800 bg-zinc-950"}`}><p className="text-[10px] text-zinc-400">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][weekday(key)]}</p><p className="text-lg font-bold mt-1">{Number(key.slice(-2))}</p><p className={`text-xs mt-1 ${snap.total?"text-lime-400":"text-zinc-600"}`}>{snap.total} ✓</p>{exams.length>0&&<span className="block mt-1 text-amber-400 text-xs" title={`${exams.length} exam(s)`}>●</span>}{classes.length>0&&<span className="block mt-1 text-sky-400 text-xs" title={`${classes.length} classes`}>■</span>}{events.length>0&&<span className="block mt-1 text-violet-400 text-xs" title={`${events.length} personal event(s)`}>◆</span>}</div>})}</div><div className="mt-4 space-y-2">{nextSevenDays.flatMap(key=>data.exams.filter(e=>e.date===key).map(e=><div key={e.id} className="rounded-xl bg-amber-400/10 border border-amber-400/20 p-3 flex justify-between items-center gap-2"><div className="min-w-0"><p className="font-semibold text-sm break-words">📚 {e.title}</p><p className="text-xs text-zinc-400">{e.course||"Exam"} · {key}</p></div><span className="text-amber-300 font-bold shrink-0">{daysBetween(today,key)===0?"TODAY":`D-${daysBetween(today,key)}`}</span></div>))}{nextSevenDays.flatMap(key=>data.events.filter(e=>e.date===key).map(e=><div key={e.id} className="rounded-xl bg-violet-400/10 border border-violet-400/20 p-3 flex justify-between items-center gap-2"><div className="min-w-0"><p className="font-semibold text-sm break-words">🗓 {e.title}</p><p className="text-xs text-zinc-400">{key}{e.notes?` · ${e.notes}`:""}</p></div><span className="text-violet-300 font-bold shrink-0">{daysBetween(today,key)===0?"TODAY":`D-${daysBetween(today,key)}`}</span></div>))}{nextSevenDays.every(key=>!data.exams.some(e=>e.date===key)&&!data.events.some(e=>e.date===key))&&<p className="text-sm text-zinc-500">No exams or personal events over the next seven days.</p>}</div><p className="text-xs text-zinc-500 mt-3">Counts include saved tasks and projected recurring goals. Tap Planner to edit them.</p></section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5" aria-label="Personal events"><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-lg">🗓 Personal events</h2><button type="button" onClick={()=>setTab("planner")} className="text-lime-400 text-sm">Add event →</button></div><p className="text-xs text-zinc-400 mt-1">Your life outside the academic trenches.</p><div className="mt-4 space-y-2">{data.events.filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4).map(e=><div key={e.id} className="flex items-start justify-between gap-3 bg-zinc-950 border border-zinc-800 p-3 rounded-xl"><div className="min-w-0"><p className="text-sm font-semibold break-words">{e.title}</p>{e.notes&&<p className="text-xs text-zinc-400 mt-1 break-words">{e.notes}</p>}</div><span className="text-xs text-violet-300 shrink-0">{e.date===today?"Today":e.date}</span></div>)}{!data.events.some(e=>e.date>=today)&&<p className="text-sm text-zinc-500">No upcoming personal events yet. Add birthdays, appointments, outings, or anything else.</p>}</div></section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-lg">Today's unfinished business</h2><button className="text-lime-400 text-sm" onClick={()=>setTab("planner")}>Manage →</button></div>{todayTasks.filter(t=>!t.done).length===0?<p className="text-zinc-400 text-sm mt-3">{allDone?"Everything is done. You are, against all odds, locked in.":"Nothing scheduled. Add a goal in Planner."}</p>:<div className="mt-3 space-y-2">{todayTasks.filter(t=>!t.done).slice(0,5).map(t=><div key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950 border border-zinc-800 p-3"><span className="text-sm min-w-0 break-words">{t.title}</span><span className="text-xs text-zinc-400 shrink-0">{t.minutes?`${Math.min(t.minutes,Math.floor(liveSeconds(t)/60))}/${t.minutes}m`:"Checklist"}</span></div>)}</div>}</section>
      {data.punishment&&<p className="text-sm text-amber-300 rounded-2xl border border-amber-900/50 bg-zinc-900 p-4">⚠️ Academic consequence: {data.punishment}</p>}
    </div>}
    {tab==="schedule"&&<div className="space-y-5">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-xl">Your schedule</h2><p className="text-xs text-zinc-400">Tap any date to see classes, exams, tasks, and personal events.</p></div><button onClick={()=>setScheduleDate(today)} className="bg-zinc-800 rounded-lg px-3 py-2 text-sm">Today</button></div>
        <div className="grid grid-cols-4 gap-1 bg-zinc-950 rounded-xl p-1 mt-4">{(["day","week","month","year"] as const).map(v=><button key={v} onClick={()=>setScheduleView(v)} className={`capitalize py-2 rounded-lg text-sm font-bold ${scheduleView===v?"bg-lime-400 text-zinc-950":"text-zinc-400"}`}>{v}</button>)}</div>
        <div className="flex justify-between items-center mt-4 gap-3"><button aria-label="Previous period" onClick={()=>navSchedule(-1)} className="bg-zinc-800 rounded-lg px-4 py-2">←</button><div className="text-center font-bold text-sm">{scheduleView==="day"?scheduleDate:scheduleView==="week"?`${scheduleWeek[0]} – ${scheduleWeek[6]}`:scheduleView==="month"?`${LOCK_MONTHS[scheduleMonthDate.getMonth()]} ${scheduleMonthDate.getFullYear()}`:scheduleDate.slice(0,4)}</div><button aria-label="Next period" onClick={()=>navSchedule(1)} className="bg-zinc-800 rounded-lg px-4 py-2">→</button></div>
        {scheduleView==="day"&&<div className="mt-5 space-y-4">
          <div className="rounded-xl border border-lime-500/40 bg-zinc-950 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">📅 {scheduleDate} · Day at a glance</h3><span className="text-xs text-zinc-400">{examsOnScheduleDate.length} exams · {calendarForDay(scheduleDate).length} scheduled · {personalEventsOnScheduleDate.length} personal</span></div>
            {examsOnScheduleDate.length>0&&<div><p className="text-xs uppercase tracking-wide text-amber-400 font-bold mb-1">Exams</p>{examsOnScheduleDate.map(exam=><p key={exam.id} className="text-sm py-1">📚 {exam.title}{exam.course?` · ${exam.course}`:""}</p>)}</div>}
            {personalEventsOnScheduleDate.length>0&&<div><p className="text-xs uppercase tracking-wide text-violet-300 font-bold mb-1">Personal events</p>{personalEventsOnScheduleDate.map(event=><p key={event.id} className="text-sm py-1">🎉 {event.title}{event.notes?` · ${event.notes}`:""}</p>)}</div>}
            {examsOnScheduleDate.length===0&&personalEventsOnScheduleDate.length===0&&calendarForDay(scheduleDate).length===0&&tasksOnScheduleDate.length===0&&<p className="text-sm text-zinc-400">Nothing scheduled for this day yet.</p>}
          </div>
          <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3"><h3 className="text-xs font-bold tracking-wider text-zinc-400 mb-2">TO DO · NO SET TIME</h3>{[...calendarForDay(scheduleDate).filter(x=>!x.start).map(x=>({id:x.id,title:x.title})),...data.tasks.filter(t=>t.createdDay===scheduleDate).map(t=>({id:t.id,title:`${t.done?"✓ ":"○ "}${t.title}`}))].map(x=><p key={x.id} className="text-sm py-1">• {x.title}</p>)}{calendarForDay(scheduleDate).every(x=>x.start)&&!data.tasks.some(t=>t.createdDay===scheduleDate)&&<p className="text-zinc-500 text-sm">Nothing unscheduled.</p>}</div>
          <div className="relative ml-12 border-l border-zinc-700" style={{height:960}}>{Array.from({length:17},(_,i)=>i+6).map(h=><div key={h} className="absolute w-full border-t border-zinc-800" style={{top:(h-6)*60}}><span className="absolute -left-14 -top-2 text-xs text-zinc-500 w-12">{String(h).padStart(2,"0")}:00</span></div>)}
          {calendarForDay(scheduleDate).filter(x=>x.start).map((x,i)=>{const top=(clockMinutes(x.start)-360);const height=Math.max(27,clockMinutes(x.end)-clockMinutes(x.start));return <div key={x.id} className={`absolute left-2 right-1 rounded-lg border px-2 py-1 overflow-hidden ${x.type==="class"?x.status==="flanked"?"bg-rose-900/80 border-rose-500":x.status==="attended"?"bg-emerald-900/80 border-emerald-500":"bg-sky-950 border-sky-600":"bg-violet-950 border-violet-600"}`} style={{top:Math.max(0,top),height:Math.min(height,960-Math.max(0,top)),zIndex:10+i}}><p className="font-bold text-xs truncate">{x.title} {x.type==="class"&&x.status?`· ${x.status}`:""}</p><p className="text-[11px] truncate">{x.start}–{x.end} {x.detail}</p></div>;})}</div>
          <p className="text-xs text-zinc-500">Time grid: 6 AM–10 PM. Classes outside these hours remain in the list below.</p>
          <h3 className="font-bold">Class attendance & scheduled events</h3>{calendarForDay(scheduleDate).map(x=><div key={x.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="flex gap-3 justify-between"><div><p className="font-bold">{x.title} {x.type==="class"&&x.status&&<span className="text-xs text-lime-400">· {x.status}</span>}</p><p className="text-xs text-zinc-400">{x.start?`${x.start}–${x.end}`:"All day"}{x.detail?` · ${x.detail}`:""}</p></div>{x.type==="event"&&<button onClick={()=>removeScheduledItem(x.item)} className="text-red-300 text-sm">Delete</button>}</div>{x.type==="class"&&<div className="grid grid-cols-2 gap-2 mt-3">{([ ["attended","✓ Attended"],["flanked","💀 Flank"],["excused","Excused"],["scheduled","Reset"] ] as const).map(([status,label])=><button key={status} disabled={scheduleDate!==today} onClick={()=>setMeetingStatus(scheduleDate,x.meeting.id,x.course,x.start,x.end,status)} className={`rounded-lg border px-2 py-2 text-xs font-bold disabled:opacity-40 ${x.status===status?"bg-lime-400 text-zinc-950 border-lime-400":"border-zinc-700 bg-zinc-800"}`}>{label}</button>)}</div>}</div>)}
        </div>}
        {scheduleView==="week"&&<div className="mt-5 overflow-x-auto"><div className="min-w-[600px] grid grid-cols-7 gap-1">{scheduleWeek.map(date=><div key={date} className="min-w-0"><button onClick={()=>{setScheduleDate(date);setScheduleView("day")}} className={`w-full rounded-lg py-2 text-xs font-bold ${date===today?"bg-lime-400 text-zinc-950":"bg-zinc-800"}`}>{["Su","Mo","Tu","We","Th","Fr","Sa"][weekday(date)]} {Number(date.slice(-2))}</button><div className="relative mt-2 h-[640px] bg-zinc-950 rounded-lg border border-zinc-800">{calendarForDay(date).filter(x=>x.start).map(x=><div key={x.id} title={`${x.title} ${x.start}–${x.end}`} style={{top:Math.max(0,(clockMinutes(x.start)-360)*2/3),height:Math.max(20,(clockMinutes(x.end)-clockMinutes(x.start))*2/3)}} className={`absolute inset-x-0.5 rounded p-1 text-[10px] overflow-hidden ${x.type==="class"?"bg-sky-900 border border-sky-600":"bg-violet-900 border border-violet-600"}`}>{x.title}<span className="block opacity-70">{x.start}</span></div>)}</div></div>)}</div><p className="mt-2 text-xs text-zinc-500">Tap a date to open its daily view. Time blocks are shown from 6 AM.</p></div>}
        {scheduleView==="month"&&<div className="mt-5"><div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-400 mb-2">{["Su","Mo","Tu","We","Th","Fr","Sa"].map((v,i)=><span key={i}>{v}</span>)}</div><div className="grid grid-cols-7 gap-1">{scheduleMonthDays.map((date,i)=><button key={date||i} disabled={!date} onClick={()=>{if(date)openCalendarDay(date);}} aria-label={date?`Open schedule for ${date}`:"Empty calendar cell"} className={`rounded-lg min-h-14 p-1 text-left border ${date===today?"border-lime-400 bg-lime-400/10":"border-zinc-800 bg-zinc-950"}`}><span className="text-xs">{date?Number(date.slice(-2)):""}</span>{date&&<p className="text-[10px] text-sky-300">{calendarForDay(date).length||""}{calendarForDay(date).length?" events":""}</p>}{date&&data.exams.some(e=>e.date===date)&&<span className="text-amber-400 text-xs">●</span>}</button>)}</div></div>}
        {scheduleView==="year"&&<div className="grid grid-cols-3 gap-2 mt-5">{LOCK_MONTHS.map((month,i)=><button key={i} onClick={()=>{setScheduleDate(`${scheduleDate.slice(0,4)}-${String(i+1).padStart(2,"0")}-01`);setScheduleView("month");}} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm font-bold">{month}<span className="block text-xs text-zinc-500 mt-1">{data.exams.filter(e=>e.date.startsWith(`${scheduleDate.slice(0,4)}-${String(i+1).padStart(2,"0")}`)).length} exams</span></button>)}</div>}
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="font-bold text-lg">📚 Courses & class meetings</h2><p className="text-zinc-400 text-sm mt-1">Add a course and its weekly class meeting days. Course tags are shared with Planner.</p>
      <div className="space-y-3 mt-4">{data.courses.map(c=><div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="flex justify-between gap-2"><div><p className="font-bold">{c.code} {c.name?`· ${c.name}`:""}</p><p className="text-xs text-zinc-400">{c.location}</p></div><button className="text-red-300 text-sm" onClick={()=>deleteCourse(c)}>Delete</button></div><div className="mt-2 space-y-1">{c.meetings.map(m=><div key={m.id} className="flex justify-between gap-2 text-xs text-zinc-400"><span>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][m.weekday]} · {m.start}–{m.end}</span><button className="text-red-300" onClick={()=>setData(prev=>({...prev,courses:prev.courses.map(course=>course.id===c.id?{...course,meetings:course.meetings.filter(x=>x.id!==m.id)}:course)}))}>Remove</button></div>)}</div><button onClick={()=>addMeeting(c.id)} className="text-xs text-lime-400 mt-3">+ Add the meeting days/times below to this course</button></div>)}</div>
      <form onSubmit={createCourse} className="space-y-3 mt-4"><input required value={courseCode} onChange={e=>setCourseCode(e.target.value)} maxLength={80} placeholder="Course code — MATH 1551" className="w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700"/><input value={courseName} onChange={e=>setCourseName(e.target.value)} placeholder="Course name (optional)" className="w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700"/><input value={courseLocation} onChange={e=>setCourseLocation(e.target.value)} placeholder="Classroom (optional)" className="w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700"/><p className="text-xs text-zinc-400">Meeting days</p><div className="grid grid-cols-7 gap-1">{["Su","Mo","Tu","We","Th","Fr","Sa"].map((name,i)=><button type="button" key={i} onClick={()=>setMeetingDays(v=>v.includes(i)?v.filter(d=>d!==i):[...v,i])} className={`rounded-lg py-2 text-xs font-bold ${meetingDays.includes(i)?"bg-lime-400 text-zinc-950":"bg-zinc-800"}`}>{name}</button>)}</div><div className="grid grid-cols-2 gap-2"><label className="text-xs text-zinc-400">Starts<input type="time" required value={meetingStart} onChange={e=>setMeetingStart(e.target.value)} className="mt-1 w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700 text-base"/></label><label className="text-xs text-zinc-400">Ends<input type="time" required value={meetingEnd} onChange={e=>setMeetingEnd(e.target.value)} className="mt-1 w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700 text-base"/></label></div><button className="w-full bg-sky-400 text-zinc-950 font-bold rounded-xl p-3">+ Add course</button></form>
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="font-bold text-lg">➕ Add to schedule</h2><p className="text-xs text-zinc-400 mt-1">No time? It goes in the day’s To Do section. Timed items become blocks.</p><form className="space-y-3 mt-4" onSubmit={addScheduledItem}><input value={scheduleTitle} required maxLength={120} onChange={e=>setScheduleTitle(e.target.value)} placeholder="Activity or event" className="w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700"/><label className="text-xs text-zinc-400">Date<input type="date" required value={scheduleDate} onChange={e=>setScheduleDate(e.target.value)} className="block mt-1 w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700 text-base"/></label><div className="grid grid-cols-2 gap-2"><label className="text-xs text-zinc-400">Start (optional)<input type="time" value={scheduleStart} onChange={e=>setScheduleStart(e.target.value)} className="block mt-1 w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700 text-base"/></label><label className="text-xs text-zinc-400">End (optional)<input type="time" value={scheduleEnd} onChange={e=>setScheduleEnd(e.target.value)} className="block mt-1 w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700 text-base"/></label></div><input value={scheduleNotes} onChange={e=>setScheduleNotes(e.target.value)} placeholder="Notes (optional)" className="w-full rounded-xl p-3 bg-zinc-950 border border-zinc-700"/><button className="w-full rounded-xl p-3 bg-violet-400 text-zinc-950 font-bold">+ Add schedule item</button></form></section>
      <p className="text-xs text-zinc-500">Flanked classes generate a same-day timer assignment in Planner. Class status can only be changed on the current date. Excused classes generate no recovery work.</p>
    </div>}
    {tab==="planner"&&<div className="space-y-6">
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex justify-between items-center"><h2 className="font-bold">TODAY&apos;S PROGRESS</h2><span className="text-sm text-zinc-400">{done}/{todayTasks.length} complete</span></div><div className="h-3 rounded-full bg-zinc-800 mt-4 overflow-hidden"><div className="h-full bg-lime-400 transition-all" style={{width:`${todayTasks.length?done/todayTasks.length*100:0}%`}}/></div><p className="mt-3 text-sm text-zinc-400">{allDone?"YOU LOCKED IN. All tasks complete.":"Finish every task to secure today's streak."}</p>{data.punishment&&<p className="mt-3 text-sm text-amber-300">⚠️ Academic consequence: {data.punishment}</p>}</section>
    <section className="space-y-3"><h2 className="font-bold text-lg">Timed assignments</h2>{todayTasks.filter(t=>t.minutes>0).length===0&&<p className="text-zinc-400 text-sm rounded-xl border border-dashed border-zinc-700 p-5">No tasks yet. Add your first daily goal below.</p>}{todayTasks.filter(t=>t.minutes>0).map(task=>{const elapsed=liveSeconds(task);const target=task.minutes*60;const unlocked=elapsed>=target;return <div key={task.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{task.title}</h3><p className="text-xs text-zinc-400 mt-1">{task.minutes===0?"Checklist task":`${task.minutes} minute requirement`}</p></div><span className={task.done?"text-lime-400 text-sm font-bold":"text-zinc-400 text-sm"}>{task.done?"✓ DONE":unlocked?"UNLOCKED":"LOCKED"}</span></div>{task.minutes>0&&<><div className="text-3xl tabular-nums font-mono mt-4">{fmt(Math.min(elapsed,86400))}</div><div className="h-2 bg-zinc-800 rounded-full mt-3 overflow-hidden"><div className="h-full bg-sky-400" style={{width:`${Math.min(100,elapsed/target*100)}%`}}/></div></>}{!task.done&&<div className="flex flex-wrap gap-2 mt-4">{task.minutes>0&&<button className="rounded-xl bg-zinc-700 px-4 py-2 font-semibold" onClick={()=>active===task.id?stopTimer():startTimer(task)}>{active===task.id?"Pause":"Start timer"}</button>}<button disabled={!unlocked} onClick={()=>completeTask(task)} className="rounded-xl bg-lime-400 px-4 py-2 font-bold text-zinc-950 disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed">Complete task</button></div>}<div className="mt-3 flex justify-end"><button type="button" className="rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-950/40" onClick={()=>deleteTask(task)} aria-label={`Delete ${task.title}`}>Delete task</button></div></div>})}</section>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between"><h2 className="font-bold text-lg">✅ Checklist</h2><span className="text-xs text-zinc-400">No timer needed</span></div><div className="mt-3 space-y-2">{todayTasks.filter(t=>t.minutes===0).length===0&&<p className="text-zinc-500 text-sm">Your errands and quick to-dos go here.</p>}{todayTasks.filter(t=>t.minutes===0).map(task=><div key={task.id} className="flex items-center gap-3 rounded-xl bg-zinc-950 border border-zinc-800 p-3"><button disabled={task.done} onClick={()=>completeTask(task)} className={`h-9 w-9 shrink-0 rounded-lg border text-lg ${task.done?"bg-lime-400 border-lime-400 text-zinc-950":"border-zinc-600 hover:border-lime-400"}`} aria-label={`Complete ${task.title}`}>{task.done?"✓":""}</button><span className={`min-w-0 flex-1 break-words ${task.done?"line-through text-zinc-500":""}`}>{task.title}</span><button onClick={()=>deleteTask(task)} className="p-2 text-red-300 text-sm" aria-label={`Delete ${task.title}`}>✕</button></div>)}</div></section>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between gap-2"><button className="rounded-lg bg-zinc-800 px-3 py-2" aria-label="Previous month" onClick={()=>setViewMonth(v=>new Date(v.getFullYear(),v.getMonth()-1,1))}>‹</button><div className="text-center"><h2 className="font-bold text-lg">{LOCK_MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</h2><p className="text-xs text-zinc-400">Your lock-in calendar</p></div><button className="rounded-lg bg-zinc-800 px-3 py-2" aria-label="Next month" onClick={()=>setViewMonth(v=>new Date(v.getFullYear(),v.getMonth()+1,1))}>›</button></div><div className="grid grid-cols-7 gap-1 mt-4 text-xs text-zinc-500 text-center">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(x=><span key={x}>{x}</span>)}</div><div className="grid grid-cols-7 gap-1 mt-2">{calendarDays.map((day,i)=>{const status=day===today?(allDone?true:null):day?data.history[day]:null;const exams=day?data.exams.filter(e=>e.date===day):[];return <button type="button" key={day||`blank-${i}`} disabled={!day} onClick={()=>{if(day)openCalendarDay(day);}} aria-label={day?`Open schedule for ${day}`:"Empty calendar cell"} title={day?`${day}: ${status===true?"Locked in":status===false?"Missed":"No result"}${exams.length?" · "+exams.map(e=>e.title).join(", "):""}`:""} className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs focus-visible:outline-2 focus-visible:outline-sky-400 hover:ring-2 hover:ring-sky-400 disabled:hover:ring-0 cursor-pointer disabled:cursor-default ${!day?"":status===true?"bg-lime-400 text-zinc-950":status===false?"bg-rose-600 text-white":day===today?"bg-zinc-700 ring-2 ring-sky-400 text-white":"bg-zinc-800 text-zinc-300"}`}>{day&&<><span>{Number(day.slice(-2))}</span>{exams.length>0&&<span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-amber-400"/>}</>}</button>})}</div><div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-400"><span>🟩 Locked in</span><span>🟥 Missed</span><span>🟡 Exam</span></div><p className="mt-3 text-sm text-zinc-400">Personal best: <strong className="text-zinc-100">{Math.max(data.bestStreak,currentStreak)}</strong> days</p></section>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-bold">📚 Exam countdowns</h2><button className="text-xs bg-zinc-800 px-3 py-2 rounded-lg" onClick={()=>examFileRef.current?.click()}>Import .ics / .csv</button><input className="hidden" ref={examFileRef} type="file" accept=".ics,.csv,text/calendar,text/csv" onChange={e=>importExams(e.target.files?.[0])}/></div><p className="mt-2 text-xs text-zinc-400">Import calendar events (.ics) or CSV with title,date,course columns. Review before importing.</p><div className="mt-4 space-y-2">{data.exams.length===0&&<p className="text-zinc-500 text-sm">No exams saved yet.</p>}{[...data.exams].sort((a,b)=>a.date.localeCompare(b.date)).map(exam=>{const left=daysBetween(today,exam.date);return <div key={exam.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="min-w-0 flex-1"><p className="font-semibold break-words">{exam.title}</p><p className="text-xs text-zinc-400">{exam.course?exam.course+" · ":""}{exam.date}</p></div><div className="text-center shrink-0"><p className={`text-xl font-black ${left<=3&&left>=0?"text-rose-400":"text-lime-400"}`}>{left<0?"Past":left===0?"TODAY":left}</p>{left>0&&<p className="text-[10px] text-zinc-500">days</p>}</div><button className="p-2 text-red-300" aria-label={`Delete ${exam.title}`} onClick={()=>removeExam(exam)}>✕</button></div>})}</div><form className="mt-4 grid gap-3" onSubmit={addExam}><input aria-label="Exam title" required maxLength={120} placeholder="Exam name (e.g. MATH 1551 Midterm)" value={examTitle} onChange={e=>setExamTitle(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"/><div className="grid grid-cols-2 gap-2"><input aria-label="Course" maxLength={80} placeholder="Course (optional)" value={examCourse} onChange={e=>setExamCourse(e.target.value)} className="min-w-0 bg-zinc-950 border border-zinc-700 rounded-xl p-3"/><input aria-label="Exam date" required type="date" value={examDate} onChange={e=>setExamDate(e.target.value)} className="min-w-0 bg-zinc-950 border border-zinc-700 rounded-xl p-3"/></div><button className="rounded-xl bg-amber-400 text-zinc-950 p-3 font-bold">+ Add exam</button></form></section>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="font-bold text-lg">🗓 Personal events</h2><p className="text-sm text-zinc-400 mt-1">Appointments, birthdays, hangouts, and other plans. Events don't affect your streak.</p><div className="space-y-2 mt-4">{[...data.events].sort((a,b)=>a.date.localeCompare(b.date)).map(item=><div key={item.id} className="flex items-center gap-3 rounded-xl bg-zinc-950 border border-zinc-800 p-3"><div className="min-w-0 flex-1"><p className="font-semibold text-sm break-words">{item.title}</p><p className="text-xs text-zinc-400 mt-1">{item.date}{item.notes?` · ${item.notes}`:""}</p></div><button type="button" onClick={()=>removeEvent(item)} className="text-red-300 px-2 py-2" aria-label={`Delete ${item.title}`}>✕</button></div>)}{data.events.length===0&&<p className="text-zinc-500 text-sm">No events added yet.</p>}</div><form className="mt-4 space-y-3" onSubmit={addEvent}><input aria-label="Event name" required maxLength={120} value={eventTitle} onChange={e=>setEventTitle(e.target.value)} placeholder="Event name (e.g. Dinner with friends)" className="block w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-base"/><input aria-label="Event date" required type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} className="block w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-base"/><input aria-label="Event notes" maxLength={500} value={eventNotes} onChange={e=>setEventNotes(e.target.value)} placeholder="Notes (optional)" className="block w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-base"/><button className="w-full bg-violet-400 text-zinc-950 font-bold rounded-xl p-3">+ Add personal event</button></form></section>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="font-bold mb-4">Add a goal</h2><div className="grid grid-cols-2 gap-2 mb-4"><button type="button" onClick={()=>setTaskKind("assignment")} className={`rounded-xl p-3 font-semibold ${taskKind==="assignment"?"bg-lime-400 text-zinc-950":"bg-zinc-800"}`}>⏱ Assignment</button><button type="button" onClick={()=>setTaskKind("checklist")} className={`rounded-xl p-3 font-semibold ${taskKind==="checklist"?"bg-lime-400 text-zinc-950":"bg-zinc-800"}`}>☑ Checklist</button></div><form onSubmit={addTask} className="space-y-3"><label className="block text-sm text-zinc-300">Task name<input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Study calculus" className="block w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-base"/></label>{taskKind==="assignment"&&<label className="block text-sm text-zinc-300">Required minutes<input type="number" min="0" max="1440" step="1" value={minutes} onChange={e=>setMinutes(e.target.value)} className="block w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-base"/></label>}<label className="block text-sm text-zinc-300">Course (optional)<select value={taskCourse} onChange={e=>setTaskCourse(e.target.value)} className="block w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-base"><option value="">General / no course</option>{courseOptions.map(course=><option key={course} value={course}>{course}</option>)}</select>{courseOptions.length===0&&<span className="block mt-1 text-xs text-zinc-500">Add a course in Schedule or an exam to populate this dropdown.</span>}</label><label className="block text-sm text-zinc-300">Repeat<select value={repeat} onChange={e=>setRepeat(e.target.value)} className="block w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-base"><option value="none">Only today</option><option value="daily">Every day</option><option value="weekdays">Weekdays (Mon–Fri)</option></select></label><button className="w-full bg-lime-400 text-zinc-950 font-bold rounded-xl p-3">+ Add task</button></form></section>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="font-bold">Backup & restore</h2><p className="text-sm text-zinc-400 mt-1">Stored on this device. Export regularly so your streak isn't lost.</p><div className="flex flex-wrap gap-2 mt-4"><button onClick={download} className="rounded-xl bg-zinc-700 px-4 py-3 font-semibold">Export JSON</button><button onClick={()=>fileRef.current?.click()} className="rounded-xl bg-zinc-700 px-4 py-3 font-semibold">Import JSON</button><input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e=>importBackup(e.target.files?.[0])}/></div></section>
    </div>}
    {showFailure && <div role="dialog" aria-modal="true" aria-label="Missed day notice" className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-5"><div className="max-w-sm w-full border border-rose-500/50 bg-zinc-950 rounded-3xl p-7 text-center space-y-4"><div className="text-6xl">💀</div><h2 className="text-3xl font-black text-rose-400">YOU HAVE NOT LOCKED IN.</h2><p className="text-zinc-300">You missed at least one required task on {data.lastPunishmentDay}. Your streak has ended.</p><p className="rounded-xl bg-zinc-900 p-4 text-amber-300">Tomorrow's academic consequence: {data.punishment}</p><button className="w-full bg-lime-400 text-zinc-950 font-bold rounded-xl p-3" onClick={()=>{localStorage.setItem("lock-in-failure-dismissed",data.lastPunishmentDay || "");setShowFailure(false);}}>I WILL LOCK IN TODAY</button></div></div>}
    {message&&<p role="status" className="text-sm text-amber-300">{message}</p>}<p className="text-xs text-zinc-500 pb-6">Prototype v0.8.3 · Active timers restore after closing the app and stop at midnight. Timers count wall-clock time; they cannot verify actual studying. Export before clearing site data.</p>
  </div></main>;
}
