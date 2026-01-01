import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Project = { id:string, code?:string, name?:string };

import { getTodayLocal } from '@/lib/dateUtils';

export default function LogHours(){
  const today = getTodayLocal();
  const now = new Date();
  const rounded = new Date(Math.round(now.getTime() / (15*60*1000)) * (15*60*1000));
  const defStart = `${String(rounded.getHours()).padStart(2,'0')}:${String(rounded.getMinutes()).padStart(2,'0')}`;
  const [projectId, setProjectId] = useState('');
  const [q, setQ] = useState('');
  const [workDate, setWorkDate] = useState(today);
  const [start, setStart] = useState(defStart);
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const qs = useMemo(()=> q? ('?q='+encodeURIComponent(q)) : '', [q]);
  const { data:projects } = useQuery({ queryKey:['projectsForLog', qs], queryFn: ()=> api<Project[]>('GET', `/projects${qs}`) });
  const mins = useMemo(()=>{
    if (!start || !end) return 0;
    const [sh,sm] = start.split(':').map(Number); const [eh,em] = end.split(':').map(Number);
    return Math.max(0,(eh*60+em)-(sh*60+sm));
  }, [start, end]);
  return (
    <div className="max-w-2xl">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 py-4 px-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1.5">Log Hours</h1>
        <p className="text-sm text-gray-600 font-medium">Record your work hours for projects</p>
      </div>
      <div className="rounded-xl border bg-white p-4 grid md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="text-xs text-gray-600">Project</label>
          <div className="flex gap-2">
            <select className="flex-1 border rounded px-3 py-2" value={projectId} onChange={e=>setProjectId(e.target.value)}>
              <option value="">Select a project...</option>
              {(projects||[]).map(p=> <option key={p.id} value={p.id}>{p.code? `${p.code} — `:''}{p.name||'Project'}</option>)}
            </select>
            <input className="w-56 border rounded px-3 py-2" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-600">Date</label>
          <input type="date" className="w-full border rounded px-3 py-2" value={workDate} onChange={e=>setWorkDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-600">Start</label>
            <input type="time" className="w-full border rounded px-3 py-2" value={start} onChange={e=>setStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">End</label>
            <input type="time" className="w-full border rounded px-3 py-2" value={end} onChange={e=>setEnd(e.target.value)} />
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-gray-600">Notes</label>
          <input className="w-full border rounded px-3 py-2" placeholder="What did you work on?" value={notes} onChange={e=>setNotes(e.target.value)} />
        </div>
        <div className="md:col-span-2 flex items-center justify-between">
          <div className="text-sm text-gray-700">Duration: {(mins/60).toFixed(2)}h</div>
          <button 
            onClick={async()=>{
              if (isSubmitting) return; // Prevent multiple clicks
              
              try{
                setIsSubmitting(true);
                if(!projectId){ toast.error('Select a project'); return; }
                if(!workDate || !start || !end){ toast.error('Date, start and end required'); return; }
                if(!notes.trim()){ toast.error('Notes required'); return; }
                
                // Validate that end time is not before start time
                const [sh, sm] = start.split(':').map(Number);
                const [eh, em] = end.split(':').map(Number);
                const startMinutes = sh * 60 + sm;
                const endMinutes = eh * 60 + em;
                if (endMinutes <= startMinutes) {
                  toast.error('End time cannot be before or equal to start time. Please select a valid time.');
                  return;
                }
                
                const payload:any = { work_date: workDate, start_time: start, end_time: end, minutes: mins, notes };
                await api('POST', `/projects/${encodeURIComponent(projectId)}/timesheet`, payload);
                toast.success('Logged');
                setEnd(''); setNotes('');
              }catch(_e){ 
                toast.error('Failed'); 
              } finally {
                setIsSubmitting(false);
              }
            }} 
            disabled={isSubmitting}
            className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
      <div className="mt-3 text-sm text-gray-600">This page is optimized for future mobile/app use as well.</div>
    </div>
  );
}


