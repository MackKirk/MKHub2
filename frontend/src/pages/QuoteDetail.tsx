import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import QuoteForm from '@/components/QuoteForm';
import ImagePicker from '@/components/ImagePicker';

type Quote = { 
  id:string, 
  code?:string, 
  name?:string, 
  client_id?:string, 
  estimator_id?:string,
  project_division_ids?:string[],
  order_number?:string,
  title?:string,
  data?:any,
  created_at?:string,
  updated_at?:string,
};

type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, category?:string, original_name?:string, uploaded_at?:string };

export default function QuoteDetail(){
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const { data:quote, isLoading } = useQuery({ queryKey:['quote', id], queryFn: ()=>api<Quote>('GET', `/quotes/${id}`) });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const { data:client } = useQuery({ queryKey:['client', quote?.client_id], queryFn: ()=> quote?.client_id? api<any>('GET', `/clients/${quote.client_id}`): Promise.resolve(null), enabled: !!quote?.client_id });
  const { data:clientFiles, refetch: refetchFiles } = useQuery({ queryKey:['clientFiles', quote?.client_id], queryFn: ()=> quote?.client_id? api<ClientFile[]>('GET', `/clients/${quote.client_id}/files`) : Promise.resolve([]), enabled: !!quote?.client_id });
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false);
  
  // Check permissions
  const isAdmin = (me?.roles||[]).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const hasViewPermission = isAdmin || permissions.has('sales:quotations:read');
  const hasEditPermission = isAdmin || permissions.has('sales:quotations:write');
  
  const estimator = employees?.find((e:any) => String(e.id) === String(quote?.estimator_id));
  
  // Hero/General Information image:
  // - Use quote override if user set it (quote-cover-derived)
  // - Otherwise match Customer image (client-logo-derived)
  // - Otherwise show the same default placeholder used on Customer pages
  const cover = useMemo(() => {
    const files = (clientFiles || []);
    const override = files.find(f => String(f.category || '') === 'quote-cover-derived');
    if (override) return `/files/${override.file_object_id}/thumbnail?w=1000`;

    const customerLogo = files.find(f => String(f.category || '') === 'client-logo-derived');
    if (customerLogo) return `/files/${customerLogo.file_object_id}/thumbnail?w=1000`;

    return '/ui/assets/placeholders/customer.png';
  }, [clientFiles]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  if (isLoading) {
    return <div className="h-24 bg-gray-100 animate-pulse rounded"/>;
  }

  if (!quote) {
    return <div className="p-4 text-red-600">Quote not found</div>;
  }

  return (
    <div>
      {/* Title Bar */}
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => {
              // Check if we came from customer page
              const state = location.state as any;
              const cameFromCustomer = state?.fromCustomer || false;
              
              if (cameFromCustomer && quote?.client_id) {
                // Redirect to customer's quotes tab
                nav(`/customers/${encodeURIComponent(String(quote.client_id))}?tab=quotes`);
              } else {
                // Redirect to main quotations page
                nav('/quotes');
              }
            }}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
            title={(location.state as any)?.fromCustomer ? "Back to Customer" : "Back to Quotations"}
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Quote Information</div>
            <div className="text-sm text-gray-500 font-medium">Quote details and proposal builder.</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>

      {/* Hero Section - Based on ProjectDetail */}
      {isHeroCollapsed ? (
        /* Collapsed View - Single Line */
        <div className="mb-4 rounded-xl border bg-white overflow-hidden relative">
          <div className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{client?.display_name || client?.name || '—'}</h3>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0 pr-10">
                {/* Estimator */}
                {estimator ? (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-xs">
                      {(estimator.name||estimator.username||'E')[0].toUpperCase()}
                    </div>
                    <div className="text-sm font-medium text-gray-700">{estimator.name||estimator.username}</div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">—</div>
                )}
              </div>
            </div>
          </div>
          
          {/* Expand button - bottom right corner of card */}
          <button
            onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-tl-lg border-t border-l bg-white hover:bg-gray-50 transition-colors flex items-center justify-center shadow-sm"
            title="Expand"
          >
            <svg 
              className="w-4 h-4 text-gray-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      ) : (
        /* Expanded View - Full Hero Section */
        <div className="mb-4 rounded-xl border bg-white overflow-hidden relative">
          <div className="p-6">
            <div className="flex gap-6 items-start">
              {/* Left Section - Image (reduced size) */}
              <div className="w-32 h-32 rounded-xl border overflow-hidden flex-shrink-0 group relative">
                <img src={cover} className="w-full h-full object-cover" />
                {hasEditPermission && (
                  <button onClick={()=>setPickerOpen(true)} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">✏️ Change</button>
                )}
              </div>
              
              {/* Middle Section - General Information */}
              <div className="flex-1 min-w-0">
                <div className="mb-4">
                  <h3 className="font-semibold text-lg mb-2">General Information</h3>
                  {quote?.client_id && (
                    <div className="text-sm mb-3">
                      <span className="text-gray-600">Customer: </span>
                      <Link 
                        to={`/customers/${encodeURIComponent(String(quote.client_id))}`}
                        className="text-[#7f1010] hover:text-[#a31414] hover:underline font-medium"
                      >
                        {client?.display_name || client?.name || 'View Customer'}
                      </Link>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Code</label>
                    <div className="text-sm font-medium">{quote?.code || quote?.order_number || '—'}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-2">Estimator</label>
                    {estimator ? (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-xs">
                          {(estimator.name||estimator.username||'E')[0].toUpperCase()}
                        </div>
                        <div className="text-sm font-medium">{estimator.name||estimator.username}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400">—</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Collapse button - bottom right corner of card */}
          <button
            onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-tl-lg border-t border-l bg-white hover:bg-gray-50 transition-colors flex items-center justify-center shadow-sm"
            title="Collapse"
          >
            <svg 
              className="w-4 h-4 text-gray-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Build your Quotation text */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Build your Quotation:</h3>
      </div>

      {/* Quote Form */}
      {hasViewPermission ? (
        <QuoteForm 
          mode="edit" 
          clientId={String(quote.client_id||'')} 
          initial={quote}
          disabled={!hasEditPermission}
        />
      ) : (
        <div className="text-center py-12 text-gray-500">
          You do not have permission to view quotations.
        </div>
      )}

      {/* Image Picker Modal */}
      <ImagePicker
        isOpen={pickerOpen}
        onClose={()=>setPickerOpen(false)}
        onConfirm={async(blob)=>{
          if(!quote?.client_id) return;
          try{
            // Save a quote-specific override (should prevail over Customer default image)
            const up:any = await api('POST','/files/upload',{ client_id: quote.client_id, employee_id:null, category_id:'quote-cover-derived', original_name:'quote-cover.jpg', content_type:'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            await api('POST', `/clients/${encodeURIComponent(String(quote.client_id))}/files?file_object_id=${encodeURIComponent(conf.id)}&category=quote-cover-derived&original_name=quote-cover.jpg`);
            toast.success('Cover updated');
            await refetchFiles();
            setPickerOpen(false);
          }catch(e){ toast.error('Failed to update cover'); setPickerOpen(false); }
        }}
        targetWidth={1024}
        targetHeight={768}
        clientId={quote?.client_id}
      />

    </div>
  );
}

