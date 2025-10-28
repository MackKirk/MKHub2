import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Order = { id:string, order_code:string, order_date:string, delivered_date?:string, status:string, email_sent:boolean };

export default function InventoryOrders(){
  const { data, isLoading } = useQuery({ queryKey:['invOrders'], queryFn: ()=>api<Order[]>('GET','/inventory/orders') });
  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Orders</div>
        <div className="text-sm opacity-90">Purchase orders and delivery status.</div>
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


