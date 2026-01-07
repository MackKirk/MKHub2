import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo } from 'react';

type Order = { id:string, order_code:string, order_date:string, delivered_date?:string, status:string, email_sent:boolean };

export default function InventoryOrders(){
  const { data, isLoading } = useQuery({ queryKey:['invOrders'], queryFn: ()=>api<Order[]>('GET','/inventory/orders') });
  
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Orders</div>
          <div className="text-sm text-gray-500 font-medium">Purchase orders and delivery status.</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-2 text-left">Code</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Date</th><th className="p-2 text-left">Delivered</th><th className="p-2 text-left">Email</th></tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={5} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : (data||[]).map(o=> (
              <tr key={o.id} className="border-t"><td className="p-2">{o.order_code}</td><td className="p-2">{o.status}</td><td className="p-2">{(o.order_date||'').slice(0,10)}</td><td className="p-2">{(o.delivered_date||'').slice(0,10)||'-'}</td><td className="p-2">{o.email_sent? 'Sent':'-'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


