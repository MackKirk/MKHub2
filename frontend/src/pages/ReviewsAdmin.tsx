import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function ReviewsAdmin(){
  const { data:templates, refetch:refetchTemplates } = useQuery({ queryKey:['review-templates'], queryFn: ()=> api<any[]>('GET','/reviews/templates') });
  const { data:cycles, refetch:refetchCycles } = useQuery({ queryKey:['review-cycles'], queryFn: ()=> api<any[]>('GET','/reviews/cycles') });
  const [name, setName] = useState('Semiannual Review');
  const [questions, setQuestions] = useState<any[]>([{ key:'performance', label:'Overall performance', type:'scale', options:{ min:1, max:5 }, required:true }]);
  const [cycleName, setCycleName] = useState('H1 Review');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [templateId, setTemplateId] = useState('');

  return (
    <div className="max-w-5xl">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Reviews Admin</div>
        <div className="text-sm opacity-90">Templates, cycles and assignments.</div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-4">
          <div className="font-semibold mb-2">Create Template</div>
          <div className="space-y-2 text-sm">
            <div>
              <div className="text-gray-600">Name</div>
              <input className="w-full border rounded px-3 py-2" value={name} onChange={e=>setName(e.target.value)} />
            </div>
            <div>
              <div className="text-gray-600">Questions</div>
              <div className="space-y-2">
                {questions.map((q,idx)=> (
                  <div key={idx} className="grid grid-cols-4 gap-2">
                    <input className="col-span-1 border rounded px-2 py-1" value={q.key} onChange={e=>{ const v=[...questions]; v[idx]={...v[idx], key:e.target.value}; setQuestions(v); }} placeholder="key" />
                    <input className="col-span-3 border rounded px-2 py-1" value={q.label} onChange={e=>{ const v=[...questions]; v[idx]={...v[idx], label:e.target.value}; setQuestions(v); }} placeholder="label" />
                  </div>
                ))}
                <button onClick={()=> setQuestions(qs=> [...qs, { key:`q${qs.length+1}`, label:'', type:'text', required:false }])} className="px-2 py-1 rounded border text-xs">Add question</button>
              </div>
            </div>
            <button onClick={async()=>{
              try{
                await api('POST','/reviews/templates',{ name, questions });
                toast.success('Template created');
                setName('');
                await refetchTemplates();
              }catch(_e){ toast.error('Failed'); }
            }} className="px-3 py-2 rounded bg-brand-red text-white">Create</button>
          </div>
          <div className="mt-4">
            <div className="font-semibold mb-1">Templates</div>
            <div className="divide-y rounded border">
              {(templates||[]).map((t:any)=> (
                <div key={t.id} className="px-3 py-2 text-sm">{t.name} v{t.version}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="font-semibold mb-2">Create Cycle</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="col-span-2">
              <div className="text-gray-600">Name</div>
              <input className="w-full border rounded px-3 py-2" value={cycleName} onChange={e=>setCycleName(e.target.value)} />
            </div>
            <div>
              <div className="text-gray-600">Start</div>
              <input type="date" className="w-full border rounded px-3 py-2" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} />
            </div>
            <div>
              <div className="text-gray-600">End</div>
              <input type="date" className="w-full border rounded px-3 py-2" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} />
            </div>
            <div className="col-span-2">
              <div className="text-gray-600">Template</div>
              <select className="w-full border rounded px-3 py-2" value={templateId} onChange={e=>setTemplateId(e.target.value)}>
                <option value="">Select...</option>
                {(templates||[]).map((t:any)=> <option key={t.id} value={t.id}>{t.name} v{t.version}</option>)}
              </select>
            </div>
            <div className="col-span-2 text-right mt-2">
              <button onClick={async()=>{
                try{
                  await api('POST', '/reviews/cycles', { name: cycleName, period_start: periodStart, period_end: periodEnd, template_id: templateId, activate: true });
                  toast.success('Cycle created');
                  setCycleName(''); setPeriodStart(''); setPeriodEnd(''); setTemplateId('');
                  await refetchCycles();
                }catch(_e){ toast.error('Failed'); }
              }} className="px-3 py-2 rounded bg-brand-red text-white">Create Cycle</button>
            </div>
          </div>
          <div className="mt-4">
            <div className="font-semibold mb-1">Cycles</div>
            <div className="divide-y rounded border">
              {(cycles||[]).map((c:any)=> (
                <div key={c.id} className="px-3 py-2 text-sm flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-gray-600 text-xs">{c.period_start||''} — {c.period_end||''}</div>
                  </div>
                  <button onClick={async()=>{
                    try{ await api('POST', `/reviews/cycles/${c.id}/assign`, {}); toast.success('Assignments generated'); }
                    catch(_e){ toast.error('Failed'); }
                  }} className="px-2 py-1 rounded border text-xs">Assign</button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <div className="font-semibold mb-1">Compare (self vs manager)</div>
            <div className="text-xs text-gray-600 mb-2">Pick a cycle to view comparisons for all employees</div>
            <div className="space-x-2">
              {(cycles||[]).map((c:any)=> (
                <button key={c.id} onClick={async()=>{
                  try{ const data = await api<any[]>('GET', `/reviews/cycles/${c.id}/compare`); console.log('compare', data); toast.success(`Loaded ${data.length} comparisons (see console)`); }
                  catch(_e){ toast.error('Failed'); }
                }} className="px-3 py-1 rounded border text-xs">{c.name}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


