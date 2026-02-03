import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';

type Client = { id:string, display_name?:string, name?:string, city?:string, province?:string, address_line1?:string };

export default function QuoteNew(){
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const initialClientId = sp.get('client_id')||'';

  const [clientId, setClientId] = useState<string>(initialClientId);
  const [clientSearch, setClientSearch] = useState<string>('');
  const [clientModalOpen, setClientModalOpen] = useState<boolean>(false);
  const [showClientDropdown, setShowClientDropdown] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const clientValid = useMemo(()=> String(clientId||'').trim().length>0, [clientId]);

  const { data:clients } = useQuery({
    queryKey:['clients-mini'],
    queryFn: async () => {
      const result = await api<any>('GET','/clients');
      if (Array.isArray(result)) return result as Client[];
      if (result && Array.isArray(result.items)) return result.items as Client[];
      if (result && Array.isArray(result.data)) return result.data as Client[];
      return [] as Client[];
    },
    staleTime: 60_000
  });
  const { data:clientSearchResults } = useQuery({ 
    queryKey:['clients-search', clientSearch], 
    queryFn: async()=>{
      if (!clientSearch.trim()) return [];
      const params = new URLSearchParams();
      params.set('q', clientSearch);
      const result = await api<any>('GET', `/clients?${params.toString()}`);
      if (Array.isArray(result)) return result as Client[];
      if (result && Array.isArray(result.items)) return result.items as Client[];
      if (result && Array.isArray(result.data)) return result.data as Client[];
      return [] as Client[];
    },
    enabled: !!clientSearch.trim() && !initialClientId
  });
  const { data:nextCode } = useQuery({ queryKey:['quoteCode', clientId], queryFn: ()=> clientId? api<any>('GET', `/quotes/next-code?client_id=${encodeURIComponent(clientId)}`) : Promise.resolve(null), enabled: !!clientId });
  
  const selectedClient = useMemo(() => {
    if (!clientId || !Array.isArray(clients)) return null;
    return clients.find(c => c.id === clientId) || null;
  }, [clientId, clients]);
  
  const filteredClients = useMemo(() => {
    if (initialClientId) return [];
    if (!clientSearch.trim()) return [];
    return clientSearchResults || [];
  }, [clientSearch, clientSearchResults, initialClientId]);

  useEffect(()=>{ 
    if(initialClientId && Array.isArray(clients)) {
      setClientId(initialClientId);
      const client = clients.find(c => c.id === initialClientId);
      if (client) {
        setClientSearch(client.display_name||client.name||client.id);
      }
    }
  }, [initialClientId, clients]);
  
  useEffect(() => {
    if (clientId && selectedClient) {
      setClientSearch(selectedClient.display_name||selectedClient.name||selectedClient.id);
      setShowClientDropdown(false);
    }
  }, [clientId, selectedClient]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // ESC to close
  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{ if (e.key==='Escape'){ nav(-1); } };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [nav]);

  const canSubmit = useMemo(()=>{
    if(!String(clientId||'').trim()) return false;
    return true;
  }, [clientId]);

  const submit = async()=>{
    if(!canSubmit || isSubmitting) return;
    try{
      setIsSubmitting(true);
      // Generate code from client code + sequence
      const code = nextCode?.order_number || '';
      const payload:any = { 
        client_id: clientId, 
        code,
        order_number: code,
      };
      const quote:any = await api('POST','/quotes', payload);
      toast.success('Quote created');
      nav(`/quotes/${encodeURIComponent(String(quote?.id||''))}`);
      return;
    }catch(_e){ 
      toast.error('Failed to create quote'); 
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center overflow-y-auto">
      <div className="w-[600px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 relative">
          <button onClick={()=> nav(-1)} className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10" title="Close">×</button>
          <div className="text-2xl font-extrabold text-white">New Quote</div>
          <div className="text-sm text-white/80 mt-1">Select customer to create quote</div>
        </div>
        <div className="overflow-y-auto">
          <div className="p-6">
            <div>
              <label className="text-xs text-gray-600">Customer *</label>
              {initialClientId ? (
                <div className="relative mt-1">
                  <input 
                    className={`w-full border rounded px-3 py-2 bg-gray-50 ${!clientValid? 'border-red-500':''}`} 
                    value={selectedClient ? (selectedClient.display_name||selectedClient.name||selectedClient.id) : ''} 
                    readOnly
                    disabled
                  />
                </div>
              ) : (
                <div className="relative mt-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <input 
                        className={`w-full border rounded px-3 py-2 ${!clientValid? 'border-red-500':''}`} 
                        placeholder="Search customer..." 
                        value={clientSearch} 
                        onChange={e=> {
                          const value = e.target.value;
                          setClientSearch(value);
                          if (!value.trim()) {
                            setClientId('');
                            setShowClientDropdown(false);
                          } else {
                            if (selectedClient && value !== (selectedClient.display_name||selectedClient.name||selectedClient.id)) {
                              setClientId('');
                              setShowClientDropdown(true);
                            } else if (!selectedClient) {
                              setShowClientDropdown(true);
                            }
                          }
                        }}
                        onFocus={() => {
                          if (clientSearch.trim() && !selectedClient) {
                            setShowClientDropdown(true);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setShowClientDropdown(false);
                            if (selectedClient) {
                              setClientSearch(selectedClient.display_name||selectedClient.name||selectedClient.id);
                            }
                          }, 200);
                        }}
                      />
                      {showClientDropdown && clientSearch.trim() && !selectedClient && filteredClients.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                          {filteredClients.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setClientId(c.id);
                                setClientSearch(c.display_name||c.name||c.id);
                                setShowClientDropdown(false);
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                            >
                              <div className="font-medium">{c.display_name||c.name||c.id}</div>
                              {c.city && <div className="text-xs text-gray-500">{c.city}{c.province ? `, ${c.province}` : ''}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                      {showClientDropdown && clientSearch.trim() && !selectedClient && filteredClients.length === 0 && clientSearchResults && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-gray-500">
                          No customers found
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setClientModalOpen(true)}
                      className="px-3 py-2 rounded border text-gray-600 hover:bg-gray-50 flex-shrink-0"
                      title="Browse all customers"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              {!clientValid && <div className="text-[11px] text-red-600 mt-1">Required</div>}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-end gap-2">
          <button onClick={()=> nav(-1)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
          <button onClick={submit} disabled={!canSubmit || isSubmitting} className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmitting ? 'Creating...' : 'Create Quote'}
          </button>
        </div>
      </div>
    </div>
    {clientModalOpen && (
      <ClientSelectModal
        open={clientModalOpen}
        onClose={() => setClientModalOpen(false)}
        onSelect={(client) => {
          setClientId(client.id);
          setClientSearch(client.display_name||client.name||client.id);
          setClientModalOpen(false);
        }}
      />
    )}
    </>
  );
}

function ClientSelectModal({ open, onClose, onSelect }: { open: boolean, onClose: ()=>void, onSelect: (client: Client)=>void }){
  const [q, setQ] = useState('');
  const [displayedCount, setDisplayedCount] = useState(20);
  const { data: allClients = [] } = useQuery<Client[]>({
    queryKey: ['clients-all', q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q.trim()) {
        params.set('q', q);
      }
      const result = await api<any>('GET', `/clients?${params.toString()}`);
      if (Array.isArray(result)) return result as Client[];
      if (result && Array.isArray(result.items)) return result.items as Client[];
      if (result && Array.isArray(result.data)) return result.data as Client[];
      return [] as Client[];
    },
    enabled: open,
    staleTime: 30_000
  });

  const sortedAllClients = useMemo(() =>
    sortByLabel(allClients, c => (c.display_name || c.name || c.id || '').toString()),
    [allClients]
  );

  const filteredClients = useMemo(() => {
    if (!q.trim()) return sortedAllClients;
    const searchLower = q.toLowerCase();
    return sortedAllClients.filter(c =>
      (c.display_name||c.name||'').toLowerCase().includes(searchLower) ||
      (c.city||'').toLowerCase().includes(searchLower) ||
      (c.address_line1||'').toLowerCase().includes(searchLower)
    );
  }, [sortedAllClients, q]);

  const list = filteredClients.slice(0, displayedCount);
  const hasMore = filteredClients.length > displayedCount;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setDisplayedCount(20);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center">
      <div className="w-[720px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Select Customer</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="flex-1">
            <label className="text-xs text-gray-600">Search Customer:</label>
            <input 
              className="w-full border rounded px-3 py-2" 
              placeholder="Type customer name, city, or address..." 
              value={q} 
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
          </div>
          {list.length > 0 && (
            <div className="max-h-96 overflow-auto rounded border divide-y">
              {list.map(c => (
                <button 
                  key={c.id} 
                  onClick={() => onSelect(c)} 
                  className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium">{c.display_name||c.name||c.id}</div>
                  <div className="text-xs text-gray-500">
                    {[c.address_line1, c.city, c.province].filter(Boolean).join(', ') || 'No address'}
                  </div>
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={() => setDisplayedCount(prev => prev + 20)}
                  className="w-full text-center px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm text-gray-600 border-t">
                  Load more ({filteredClients.length - displayedCount} remaining)
                </button>
              )}
            </div>
          )}
          {q.trim() && list.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No customers found matching "{q}"
            </div>
          )}
          {!q.trim() && list.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No customers available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
