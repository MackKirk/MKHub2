import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function ReviewsCompare(){
  const { data:cycles } = useQuery({ queryKey:['review-cycles'], queryFn: ()=> api<any[]>('GET','/reviews/cycles') });
  const [cycleId, setCycleId] = useState<string>('');
  const { data:rows } = useQuery({ queryKey:['review-compare', cycleId], queryFn: ()=> cycleId? api<any[]>('GET', `/reviews/cycles/${cycleId}/compare`) : Promise.resolve([]) });
  const [q, setQ] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [selfStatus, setSelfStatus] = useState<string>('');
  const [mgrStatus, setMgrStatus] = useState<string>('');
  const [openId, setOpenId] = useState<string>('');

  // Collect all question keys from first row for header
  const headers = useMemo(()=>{
    const first = (rows||[])[0];
    return first? (first.comparison||[]).map((c:any)=> ({ key:c.key, label:c.label })) : [];
  }, [rows]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="max-w-[1200px]">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Reviews Comparison</div>
          <div className="text-sm text-gray-500 font-medium">Compare self vs manager responses by cycle.</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm text-gray-600">Cycle</span>
        <select className="border rounded px-2 py-1" value={cycleId} onChange={e=> setCycleId(e.target.value)}>
          <option value="">Select...</option>
          {(cycles||[]).map((c:any)=> <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="Search user" className="border rounded px-2 py-1 ml-3" value={q} onChange={e=>setQ(e.target.value)} />
        <label className="ml-2 text-sm flex items-center gap-1"><input type="checkbox" checked={onlyDiff} onChange={e=>setOnlyDiff(e.target.checked)} /> Only differences</label>
        <span className="ml-2 text-sm text-gray-600">Self</span>
        <select className="border rounded px-2 py-1" value={selfStatus} onChange={e=>setSelfStatus(e.target.value)}>
          <option value="">Any</option>
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
        </select>
        <span className="ml-2 text-sm text-gray-600">Mgr</span>
        <select className="border rounded px-2 py-1" value={mgrStatus} onChange={e=>setMgrStatus(e.target.value)}>
          <option value="">Any</option>
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="border px-2 py-1 text-left w-9">\u25BC</th>
              <th className="border px-2 py-1 text-left">Employee</th>
              <th className="border px-2 py-1 text-left">Status</th>
              {headers.map(h=> (
                <th key={h.key} className="border px-2 py-1 text-left">
                  <div className="font-medium">{h.label}</div>
                  <div className="text-[11px] text-gray-500">Self vs Manager</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows||[]).filter((r:any)=>{
              if(!q.trim()) return true;
              const name = String(r.reviewee_name||'').toLowerCase();
              return name.includes(q.toLowerCase());
            }).map((r:any)=> {
              const hasDiff = (r.comparison||[]).some((c:any)=> String(c.self??'') !== String(c.manager??''));
              if(onlyDiff && !hasDiff) return null;
              if(selfStatus && (r.self_status||'pending') !== selfStatus) return null;
              if(mgrStatus && (r.manager_status||'pending') !== mgrStatus) return null;
              return (
              <>
                <tr key={r.reviewee_user_id}>
                  <td className="border px-2 py-1 text-center">
                    <button onClick={()=> setOpenId(v=> v===r.reviewee_user_id? '': r.reviewee_user_id)} className="text-xs">{openId===r.reviewee_user_id? '▾':'▸'}</button>
                  </td>
                  <td className="border px-2 py-1 whitespace-nowrap">{r.reviewee_name||r.reviewee_user_id}</td>
                  <td className="border px-2 py-1 whitespace-nowrap text-xs">
                    <span className={`px-2 py-0.5 rounded-full border ${r.self_status==='submitted'?'bg-green-50 border-green-300 text-green-700':'bg-gray-50 border-gray-300 text-gray-700'}`}>Self: {r.self_status||'pending'}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full border ${r.manager_status==='submitted'?'bg-green-50 border-green-300 text-green-700':'bg-gray-50 border-gray-300 text-gray-700'}`}>Mgr: {r.manager_status||'pending'}</span>
                  </td>
                  {headers.map(h=> {
                    const cell = (r.comparison||[]).find((c:any)=> c.key===h.key) || {};
                    const selfV = cell.self ?? '';
                    const mgrV = cell.manager ?? '';
                    const diff = String(selfV) !== String(mgrV);
                    return (
                      <td key={h.key} className={`border px-2 py-1 align-top ${diff? 'bg-yellow-50':''}`}>
                        <div className="text-gray-700 truncate max-w-[240px]">{selfV}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[240px]">{mgrV}</div>
                      </td>
                    );
                  })}
                </tr>
                {openId===r.reviewee_user_id && (
                  <tr>
                    <td className="border px-2 py-2 bg-gray-50" colSpan={headers.length+2}>
                      <div className="grid grid-cols-1 gap-2">
                        {(r.comparison||[]).filter((c:any)=> !onlyDiff || String(c.self??'')!==String(c.manager??'')).map((c:any)=> (
                          <div key={c.key} className="rounded border bg-white p-2">
                            <div className="text-sm font-medium mb-1">{c.label}</div>
                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <div className="text-[11px] text-gray-500 mb-1">Self</div>
                                <div className="whitespace-pre-wrap break-words text-gray-800">{c.self||''}</div>
                              </div>
                              <div>
                                <div className="text-[11px] text-gray-500 mb-1">Manager</div>
                                <div className="whitespace-pre-wrap break-words text-gray-800">{c.manager||''}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="text-xs text-gray-500">Assignments: self {r.self_assignment_id||'-'} · manager {r.manager_assignment_id||'-'}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );})}
          </tbody>
        </table>
      </div>
    </div>
  );
}


