import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Client = { id:string, name?:string, display_name?:string, city?:string, province?:string, postal_code?:string, country?:string, address_line1?:string, address_line2?:string, created_at?:string };

export default function CustomerDetail(){
  const { id } = useParams();
  const { data, isLoading } = useQuery({ queryKey:['client', id], queryFn: ()=>api<Client>('GET', `/clients/${id}`) });
  const c = data || {} as Client;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-200 border"/>
        <h2 className="text-xl font-extrabold">{c.display_name||c.name||'Customer'}</h2>
      </div>
      <div className="rounded-xl border bg-white">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] rounded-t-xl p-5 text-white">
          <div className="flex justify-between items-end">
            <div>
              <div className="text-2xl font-extrabold">{c.display_name||c.name||id}</div>
              <div className="opacity-90 text-sm">{c.city||''} {c.province||''} {c.country||''}</div>
            </div>
            <div><button className="px-4 py-2 rounded-xl bg-black/80">Actions</button></div>
          </div>
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-4">
          {isLoading? <div className="h-24 animate-pulse bg-gray-100 rounded"/> : (
            <>
              <Field label="Address line 1"><div className="border rounded px-3 py-2 bg-gray-50">{c.address_line1||'-'}</div></Field>
              <Field label="Address line 2"><div className="border rounded px-3 py-2 bg-gray-50">{c.address_line2||'-'}</div></Field>
              <Field label="City"><div className="border rounded px-3 py-2 bg-gray-50">{c.city||'-'}</div></Field>
              <Field label="Province/State"><div className="border rounded px-3 py-2 bg-gray-50">{c.province||'-'}</div></Field>
              <Field label="Postal code"><div className="border rounded px-3 py-2 bg-gray-50">{c.postal_code||'-'}</div></Field>
              <Field label="Country"><div className="border rounded px-3 py-2 bg-gray-50">{c.country||'-'}</div></Field>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({label, children}:{label:string, children:any}){
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-600">{label}</label>
      {children}
    </div>
  );
}


