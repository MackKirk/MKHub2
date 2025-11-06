import { useMemo, useState } from 'react';

type CalendarMockProps = {
  title?: string;
};

export default function CalendarMock({ title }: CalendarMockProps){
  const [anchorDate, setAnchorDate] = useState<Date>(()=>{
    const d = new Date();
    d.setDate(1);
    d.setHours(0,0,0,0);
    return d;
  });

  const days = useMemo(()=>{
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const first = new Date(year, month, 1);
    const firstWeekday = first.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = firstWeekday; // leading blanks
    const totalCells = Math.ceil((prevDays + daysInMonth) / 7) * 7; // 5 or 6 weeks

    const cells: { date: Date | null, key: string }[] = [];
    for(let i=0;i<totalCells;i++){
      const dayIndex = i - prevDays + 1;
      if(dayIndex >= 1 && dayIndex <= daysInMonth){
        const d = new Date(year, month, dayIndex);
        cells.push({ date: d, key: d.toISOString().slice(0,10) });
      } else {
        cells.push({ date: null, key: `blank-${i}` });
      }
    }
    return cells;
  }, [anchorDate]);

  const monthLabel = useMemo(()=>{
    return anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [anchorDate]);

  const tasksByDate = useMemo(()=>{
    // Simple static examples for the current month
    const y = anchorDate.getFullYear();
    const m = anchorDate.getMonth();
    const key = (d:number)=> new Date(y, m, d).toISOString().slice(0,10);
    return {
      [key(3)]: ['Kickoff call', 'Share brief'],
      [key(7)]: ['Site visit', 'Photoshoot'],
      [key(12)]: ['Client review', 'Approve materials'],
      [key(18)]: ['Procurement', 'Order supplies'],
      [key(22)]: ['Crew scheduling'],
      [key(27)]: ['Milestone check-in']
    } as Record<string, string[]>;
  }, [anchorDate]);

  const weekDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-lg">{title || 'Calendar'}</div>
        <div className="flex items-center gap-2">
          <button onClick={()=> setAnchorDate(d=> new Date(d.getFullYear(), d.getMonth()-1, 1))} className="px-2 py-1 rounded bg-gray-100">Prev</button>
          <div className="px-2 text-sm text-gray-700 min-w-[140px] text-center">{monthLabel}</div>
          <button onClick={()=> setAnchorDate(d=> new Date(d.getFullYear(), d.getMonth()+1, 1))} className="px-2 py-1 rounded bg-gray-100">Next</button>
          <button onClick={()=> setAnchorDate(()=>{ const n=new Date(); n.setDate(1); n.setHours(0,0,0,0); return n; })} className="px-2 py-1 rounded bg-gray-100">Today</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map(d=> (
          <div key={d} className="text-[11px] uppercase tracking-wide text-gray-600 text-center">{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-2">
        {days.map(({ date, key })=> {
          if(!date) return <div key={key} className="h-24 rounded border bg-gray-50" />;
          const ds = date.toISOString().slice(0,10);
          const items = tasksByDate[ds] || [];
          const isToday = (()=>{
            const t = new Date();
            return t.toISOString().slice(0,10) === ds;
          })();
          return (
            <div key={key} className={`h-24 rounded border bg-white p-2 flex flex-col ${isToday? 'ring-2 ring-brand-red': ''}`}>
              <div className="text-xs font-semibold text-gray-700">{date.getDate()}</div>
              <div className="mt-1 flex-1 overflow-hidden">
                {items.length? (
                  <ul className="space-y-1">
                    {items.slice(0,3).map((t,i)=> (
                      <li key={i} className="text-[11px] leading-snug truncate before:content-['•'] before:mr-1 before:text-gray-400">{t}</li>
                    ))}
                    {items.length>3 && <li className="text-[10px] text-gray-500">+{items.length-3} more</li>}
                  </ul>
                ) : (
                  <div className="text-[10px] text-gray-400">No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


