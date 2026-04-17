import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { effectiveShowInProject, effectiveShowInOpportunity } from '@/lib/projectStatusVisibility';

type Item = { id:string, label:string, value?:string, sort_index?:number, meta?: any };

export default function SystemSettings(){
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data, refetch, isLoading } = useQuery({ queryKey:['settings-bundle'], queryFn: ()=>api<Record<string, Item[]>>('GET','/settings') });
  // Filter out non-list settings (like google_places_api_key) and lists with dedicated sections (like terms-templates)
  const lists = Object.entries(data||{})
    .filter(([name]) => !['google_places_api_key', 'terms-templates', 'branding', 'standard_file_categories'].includes(name))
    .sort(([a],[b])=> a.localeCompare(b));
  const [sel, setSel] = useState<string>('client_statuses');
  const items = (data||{})[sel]||[];
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [newShowInProject, setNewShowInProject] = useState(true);
  const [newShowInOpportunity, setNewShowInOpportunity] = useState(true);
  
  // Reset form fields when selection changes
  useEffect(() => {
    setLabel('');
    setValue('');
    setDescription('');
    setNewShowInProject(true);
    setNewShowInOpportunity(true);
    setEdits({});
  }, [sel]);
  const [edits, setEdits] = useState<Record<string, Item>>({});
  const isColorList = useMemo(()=> sel.toLowerCase().includes('status'), [sel]);
  const isDivisionList = useMemo(()=> sel.toLowerCase().includes('division'), [sel]);
  const isTimesheetConfig = useMemo(()=> sel === 'timesheet', [sel]);
  const isTermsTemplates = useMemo(()=> sel === 'terms-templates', [sel]);
  const getEdit = (it: Item): Item => edits[it.id] || it;
  
  // Timesheet configuration values
  const timesheetItems = (data?.timesheet||[]) as Item[];
  const breakMinItem = timesheetItems.find(i=> i.label === 'default_break_minutes');
  const breakEmployeesItem = timesheetItems.find(i=> i.label === 'break_eligible_employees');
  const geofenceRadiusItem = timesheetItems.find(i=> i.label === 'default_geofence_radius_meters');
  const [breakMin, setBreakMin] = useState<string>(breakMinItem?.value || '30');
  const [geofenceRadius, setGeofenceRadius] = useState<string>(geofenceRadiusItem?.value || '150');
  const [selectedBreakEmployees, setSelectedBreakEmployees] = useState<string[]>([]);
  const [breakEmployeeSearch, setBreakEmployeeSearch] = useState('');
  const [breakEmployeeDropdownOpen, setBreakEmployeeDropdownOpen] = useState(false);
  const breakEmployeeDropdownRef = useRef<HTMLDivElement>(null);
  
  // Fetch employees for break selection
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });
  
  // Update local state when items change
  useEffect(()=>{
    if(breakMinItem?.value) setBreakMin(breakMinItem.value);
    if(geofenceRadiusItem?.value) setGeofenceRadius(geofenceRadiusItem.value);
    if(breakEmployeesItem?.value) {
      try {
        const employeeIds = JSON.parse(breakEmployeesItem.value);
        setSelectedBreakEmployees(Array.isArray(employeeIds) ? employeeIds : []);
      } catch {
        setSelectedBreakEmployees([]);
      }
    }
  }, [breakMinItem?.value, geofenceRadiusItem?.value, breakEmployeesItem?.value]);
  
  // Filter employees by search
  const filteredBreakEmployees = useMemo(() => {
    if (!employees || !Array.isArray(employees)) return [];
    if (!breakEmployeeSearch) return employees;
    const searchLower = breakEmployeeSearch.toLowerCase();
    return employees.filter((u: any) => {
      const name = (u.name || u.username || '').toLowerCase();
      return name.includes(searchLower);
    });
  }, [employees, breakEmployeeSearch]);
  
  const toggleBreakEmployee = (employeeId: string) => {
    setSelectedBreakEmployees((prev) => {
      const prevArray = Array.isArray(prev) ? prev : [];
      return prevArray.includes(employeeId) 
        ? prevArray.filter((id) => id !== employeeId) 
        : [...prevArray, employeeId];
    });
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (breakEmployeeDropdownRef.current && !breakEmployeeDropdownRef.current.contains(event.target as Node)) {
        setBreakEmployeeDropdownOpen(false);
      }
    };

    if (breakEmployeeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [breakEmployeeDropdownOpen]);
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">System Settings</div>
          <div className="text-sm text-gray-500 font-medium">Manage application lists, statuses, and divisions.</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      {/* Company Files Configuration */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-semibold mb-3">Company Files Organization</h3>
        <p className="text-sm text-gray-600 mb-4">
          Configure file categories and standard file categories to standardize file organization across the system.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {/* File Categories Section */}
          <div>
            <h4 className="font-semibold mb-2 text-sm">File Categories</h4>
            <p className="text-xs text-gray-500 mb-3">
              File categories are top-level folders for company-wide files (e.g., HR, Finance, Operations, Marketing).
              Each category can have its own folder structure.
            </p>
            <CompanyFilesDepartments />
          </div>
          {/* Standard Categories Section */}
          <div>
            <h4 className="font-semibold mb-2 text-sm">Standard File Categories</h4>
            <p className="text-xs text-gray-500 mb-3">
              Edit display name, description and icon: these drive project upload categories and the names of
              subfolders created when initializing default project folders.
            </p>
            <StandardFileCategories />
          </div>
        </div>
      </div>

      {/* Permission Templates Section */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-semibold mb-3">Permission Templates</h3>
        <p className="text-sm text-gray-600 mb-4">
          Create and manage permission templates (gabaritos) that reuse existing permissions. Apply a template in a user&apos;s Permissions tab to quickly set multiple permissions at once. Templates do not create new permissions—they only reference existing ones.
        </p>
        <PermissionTemplatesSection />
      </div>

      {/* Terms Templates Section */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-semibold mb-3">Terms Templates</h3>
        <p className="text-sm text-gray-600 mb-4">
          Create and manage Terms templates for use in Proposals and Quotes. Select a template from the dropdown in proposal/quote forms to automatically populate the Terms section.
        </p>
        <TermsTemplatesSection />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-3">
          <h4 className="font-semibold mb-2">Lists</h4>
          <div className="space-y-1">
            {lists.map(([name])=> {
              // Format display name for better readability
              const displayName = name === 'terms-templates' ? 'Terms Templates' : name;
              return (
                <button key={name} onClick={()=>setSel(name)} className={`w-full text-left px-3 py-2 rounded ${sel===name? 'bg-black text-white':'hover:bg-gray-50'}`}>{displayName}</button>
              );
            })}
          </div>
        </div>
        <div className="md:col-span-2 rounded-xl border bg-white p-3">
          {isTimesheetConfig ? (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Timesheet Configuration</h4>
                <div className="text-sm text-gray-600 mb-4">Configure default values for shift creation.</div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Break for Shifts of 5 Hours or More (minutes)</label>
                  <input
                    type="number"
                    value={breakMin}
                    onChange={(e) => setBreakMin(e.target.value)}
                    min="0"
                    className="w-full border rounded px-3 py-2"
                    placeholder="30"
                  />
                  <div className="text-xs text-gray-500 mt-1">Break duration in minutes that will be deducted from attendance records of 5 hours or more for selected employees.</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Employees Eligible for Break {selectedBreakEmployees.length > 0 && `(${selectedBreakEmployees.length} selected)`}
                  </label>
                  <div className="relative" ref={breakEmployeeDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setBreakEmployeeDropdownOpen(!breakEmployeeDropdownOpen)}
                      className="w-full border rounded px-3 py-2 text-left bg-white flex items-center justify-between"
                    >
                      <span className="text-sm text-gray-600">
                        {selectedBreakEmployees.length === 0
                          ? 'Select employees...'
                          : `${selectedBreakEmployees.length} employee${selectedBreakEmployees.length > 1 ? 's' : ''} selected`}
                      </span>
                      <span className="text-gray-400">{breakEmployeeDropdownOpen ? '▲' : '▼'}</span>
                    </button>
                    {breakEmployeeDropdownOpen && (
                      <div 
                        className="absolute z-50 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-60 overflow-auto"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className="p-2 border-b space-y-2">
                          <input
                            type="text"
                            placeholder="Search employees..."
                            value={breakEmployeeSearch}
                            onChange={(e) => setBreakEmployeeSearch(e.target.value)}
                            className="w-full border rounded px-2 py-1 text-sm"
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!Array.isArray(filteredBreakEmployees)) return;
                                const allFilteredIds = filteredBreakEmployees.map((u: any) => u.id);
                                setSelectedBreakEmployees((prev) => {
                                  const prevArray = Array.isArray(prev) ? prev : [];
                                  const newSet = new Set([...prevArray, ...allFilteredIds]);
                                  return Array.from(newSet);
                                });
                              }}
                              className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedBreakEmployees([]);
                              }}
                              className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>
                        <div className="p-2">
                          {(Array.isArray(filteredBreakEmployees) && filteredBreakEmployees.length > 0) ? (
                            filteredBreakEmployees.map((u: any) => (
                              <label
                                key={u.id}
                                className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedBreakEmployees.includes(u.id)}
                                  onChange={() => toggleBreakEmployee(u.id)}
                                  className="rounded"
                                  onMouseDown={(e) => e.stopPropagation()}
                                />
                                <span className="text-sm">{u.name || u.username}</span>
                              </label>
                            ))
                          ) : (
                            <div className="p-2 text-sm text-gray-600">No employees found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {selectedBreakEmployees.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedBreakEmployees.map((employeeId) => {
                        const employee = (Array.isArray(employees) ? employees : []).find((u: any) => u.id === employeeId);
                        return (
                          <span
                            key={employeeId}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                          >
                            {employee?.name || employee?.username || employeeId}
                            <button
                              type="button"
                              onClick={() => toggleBreakEmployee(employeeId)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">Select employees who are eligible for break deduction when their attendance is 5 hours or more.</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Geofence Radius (meters)</label>
                  <input
                    type="number"
                    value={geofenceRadius}
                    onChange={(e) => setGeofenceRadius(e.target.value)}
                    min="0"
                    className="w-full border rounded px-3 py-2"
                    placeholder="150"
                  />
                  <div className="text-xs text-gray-500 mt-1">Default geofence radius in meters for new shifts.</div>
                </div>
                
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      try {
                        // Save or update default_break_minutes
                        if (breakMinItem) {
                          await api('PUT', `/settings/timesheet/${encodeURIComponent(breakMinItem.id)}?label=default_break_minutes&value=${encodeURIComponent(breakMin)}`);
                        } else {
                          await api('POST', `/settings/timesheet?label=default_break_minutes&value=${encodeURIComponent(breakMin)}`);
                        }
                        
                        // Save or update break_eligible_employees (as JSON array)
                        const employeesJson = JSON.stringify(selectedBreakEmployees);
                        if (breakEmployeesItem) {
                          await api('PUT', `/settings/timesheet/${encodeURIComponent(breakEmployeesItem.id)}?label=break_eligible_employees&value=${encodeURIComponent(employeesJson)}`);
                        } else {
                          await api('POST', `/settings/timesheet?label=break_eligible_employees&value=${encodeURIComponent(employeesJson)}`);
                        }
                        
                        // Save or update default_geofence_radius_meters
                        if (geofenceRadiusItem) {
                          await api('PUT', `/settings/timesheet/${encodeURIComponent(geofenceRadiusItem.id)}?label=default_geofence_radius_meters&value=${encodeURIComponent(geofenceRadius)}`);
                        } else {
                          await api('POST', `/settings/timesheet?label=default_geofence_radius_meters&value=${encodeURIComponent(geofenceRadius)}`);
                        }
                        
                        await refetch();
                        // Invalidate settings-bundle query to sync with UserInfo TimesheetBlock
                        queryClient.invalidateQueries({ queryKey: ['settings-bundle'] });
                        toast.success('Timesheet settings saved');
                      } catch (_e) {
                        toast.error('Failed to save');
                      }
                    }}
                    className="px-4 py-2 rounded bg-brand-red text-white"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {isTermsTemplates ? (
                <div className="space-y-3 mb-4">
                  <h4 className="font-semibold">Terms Templates</h4>
                  <div className="space-y-2">
                    <input className="border rounded px-2 py-1 text-sm w-full" placeholder="Template Name" value={label} onChange={e=>setLabel(e.target.value)} />
                    <textarea 
                      className="border rounded px-2 py-1 text-sm w-full" 
                      placeholder="Terms Description (full text)"
                      value={description} 
                      onChange={e=>setDescription(e.target.value)}
                      rows={8}
                    />
                    <button onClick={async()=>{ if(!label){ toast.error('Template name required'); return; } try{ const url = `/settings/${encodeURIComponent(sel)}?label=${encodeURIComponent(label)}&description=${encodeURIComponent(description||'')}`; await api('POST', url); setLabel(''); setDescription(''); await refetch(); toast.success('Added'); }catch(_e){ toast.error('Failed'); } }} className="px-3 py-1.5 rounded bg-brand-red text-white">Add</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">{sel}</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input className="border rounded px-2 py-1 text-sm" placeholder="Label" value={label} onChange={e=>setLabel(e.target.value)} />
                    {isDivisionList ? (
                      <>
                        <input className="border rounded px-2 py-1 text-sm w-28" placeholder="Abbr" value={(value||'').split('|')[0]||''} onChange={e=>{ const parts = (value||'').split('|'); parts[0] = e.target.value; setValue(parts.join('|')); }} />
                        <input type="color" title="Color" className="border rounded w-10 h-8 p-0" value={((value||'').split('|')[1]||'#cccccc')} onChange={e=>{ const parts = (value||'').split('|'); parts[1] = e.target.value; setValue(parts.join('|')); }} />
                      </>
                    ) : isColorList ? (
                      <input type="color" title="Color" className="border rounded w-10 h-8 p-0" value={value||'#cccccc'} onChange={e=>setValue(e.target.value)} />
                    ) : (
                      <input className="border rounded px-2 py-1 text-sm" placeholder="Value" value={value} onChange={e=>setValue(e.target.value)} />
                    )}
                    {sel === 'project_statuses' && (
                      <span className="flex items-center gap-3 text-xs text-gray-700">
                        <label className="flex items-center gap-1 whitespace-nowrap">
                          <input type="checkbox" checked={newShowInProject} onChange={e=> setNewShowInProject(e.target.checked)} />
                          Project
                        </label>
                        <label className="flex items-center gap-1 whitespace-nowrap">
                          <input type="checkbox" checked={newShowInOpportunity} onChange={e=> setNewShowInOpportunity(e.target.checked)} />
                          Opportunity
                        </label>
                      </span>
                    )}
                    <button onClick={async()=>{ if(!label){ toast.error('Label required'); return; } try{ await api('POST', `/settings/${encodeURIComponent(sel)}`, undefined, { 'Content-Type':'application/x-www-form-urlencoded' }); }catch{} try{ let url = `/settings/${encodeURIComponent(sel)}?label=${encodeURIComponent(label)}`; if(isDivisionList){ const [abbr, color] = (value||'').split('|'); url += `&abbr=${encodeURIComponent(abbr||'')}&color=${encodeURIComponent(color||'#cccccc')}`; } else if (isColorList){ url += `&value=${encodeURIComponent(value||'#cccccc')}`; if (sel === 'project_statuses'){ url += `&show_in_project=${newShowInProject ? 'true' : 'false'}&show_in_opportunity=${newShowInOpportunity ? 'true' : 'false'}`; } } else { url += `&value=${encodeURIComponent(value||'')}`; } await api('POST', url); setLabel(''); setValue(''); await refetch(); toast.success('Added'); }catch(_e){ toast.error('Failed'); } }} className="px-3 py-1.5 rounded bg-brand-red text-white">Add</button>
                  </div>
                </div>
              )}
              <div className="rounded border overflow-hidden divide-y">
                {isLoading? <div className="p-3"><div className="h-6 bg-gray-100 animate-pulse rounded"/></div> : items.length? items.map(it=> {
                  const e = getEdit(it);
                  return (
                    <div key={it.id} className={`px-3 py-2 text-sm ${isTermsTemplates ? 'flex flex-col gap-2' : 'flex items-center justify-between gap-3'}`}>
                      <div className={`${isTermsTemplates ? 'space-y-2' : 'flex items-center gap-2 flex-1 min-w-0'}`}>
                        <input className="border rounded px-2 py-1 text-sm w-48" value={e.label} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), label: ev.target.value } }))} />
                        {isTermsTemplates ? (
                          <textarea 
                            className="border rounded px-2 py-1 text-sm w-full" 
                            placeholder="Terms Description"
                            value={e.meta?.description||''} 
                            onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), description: ev.target.value } } }))}
                            rows={8}
                          />
                        ) : isDivisionList ? (
                          <>
                            <input className="border rounded px-2 py-1 text-sm w-24" placeholder="Abbr" value={e.meta?.abbr||''} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), abbr: ev.target.value } } }))} />
                            <input type="color" title="Color" className="border rounded w-10 h-8 p-0" value={e.meta?.color||'#cccccc'} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), color: ev.target.value } } }))} />
                          </>
                        ) : isColorList ? (
                          <>
                            <input type="color" title="Color" className="border rounded w-10 h-8 p-0" value={e.value||'#cccccc'} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), value: ev.target.value } }))} />
                            <span className="text-[11px] text-gray-500">{e.value}</span>
                            {sel === 'project_statuses' && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 ml-2">
                                <label className="flex items-center gap-1 text-xs text-gray-700 whitespace-nowrap">
                                  <input type="checkbox" checked={typeof e.meta?.show_in_project === 'boolean' ? e.meta.show_in_project : effectiveShowInProject(it)} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), show_in_project: ev.target.checked } } }))} />
                                  Show in projects
                                </label>
                                <label className="flex items-center gap-1 text-xs text-gray-700 whitespace-nowrap">
                                  <input type="checkbox" checked={typeof e.meta?.show_in_opportunity === 'boolean' ? e.meta.show_in_opportunity : effectiveShowInOpportunity(it)} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), show_in_opportunity: ev.target.checked } } }))} />
                                  Show in opportunities
                                </label>
                                <label className="flex items-center gap-1 text-xs text-gray-700">
                                  <input type="checkbox" checked={!!e.meta?.allow_edit_proposal} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), allow_edit_proposal: ev.target.checked } } }))} />
                                  Allow edit proposal/estimate
                                </label>
                                <label className="flex items-center gap-1 text-xs text-gray-700">
                                  <input type="checkbox" checked={!!e.meta?.sets_start_date} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), sets_start_date: ev.target.checked } } }))} />
                                  Sets start date
                                </label>
                                <label className="flex items-center gap-1 text-xs text-gray-700">
                                  <input type="checkbox" checked={!!e.meta?.sets_end_date} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), sets_end_date: ev.target.checked } } }))} />
                                  Sets end date
                                </label>
                              </div>
                            )}
                          </>
                        ) : (
                          <input className="border rounded px-2 py-1 text-sm w-40" placeholder="Value" value={e.value||''} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), value: ev.target.value } }))} />
                        )}
                        {/* sort index is now auto-assigned and not user-editable */}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={async()=>{ try{ let url = `/settings/${encodeURIComponent(sel)}/${encodeURIComponent(it.id)}?label=${encodeURIComponent(e.label||'')}`; if (isTermsTemplates){ url += `&description=${encodeURIComponent(e.meta?.description||'')}`; } else if (isDivisionList){ url += `&abbr=${encodeURIComponent(e.meta?.abbr||'')}&color=${encodeURIComponent(e.meta?.color||'')}`; } else if (isColorList){ url += `&value=${encodeURIComponent(e.value||'')}`; if (sel === 'project_statuses'){ const allowEdit = e.meta?.allow_edit_proposal; const setsStart = e.meta?.sets_start_date; const setsEnd = e.meta?.sets_end_date; const sip = typeof e.meta?.show_in_project === 'boolean' ? e.meta.show_in_project : effectiveShowInProject(it); const sio = typeof e.meta?.show_in_opportunity === 'boolean' ? e.meta.show_in_opportunity : effectiveShowInOpportunity(it); url += `&allow_edit_proposal=${(allowEdit === true || allowEdit === 'true' || allowEdit === 1) ? 'true' : 'false'}`; url += `&sets_start_date=${(setsStart === true || setsStart === 'true' || setsStart === 1) ? 'true' : 'false'}`; url += `&sets_end_date=${(setsEnd === true || setsEnd === 'true' || setsEnd === 1) ? 'true' : 'false'}`; url += `&show_in_project=${sip ? 'true' : 'false'}&show_in_opportunity=${sio ? 'true' : 'false'}`; } } else { url += `&value=${encodeURIComponent(e.value||'')}`; } await api('PUT', url); await refetch(); toast.success('Saved'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-black text-white">Save</button>
                        <button onClick={async()=>{ if(!(await confirm({ title: 'Delete item?', description: 'This action cannot be undone.' }))) return; try{ await api('DELETE', `/settings/${encodeURIComponent(sel)}/${encodeURIComponent(it.id)}`); await refetch(); toast.success('Deleted'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
                      </div>
                    </div>
                  );
                }) : <div className="p-3 text-sm text-gray-600">No items</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Permission Templates Section Component
type PermTemplate = { id: string; name: string; permission_keys: string[] };
type PermDefItem = { id: string; key: string; label: string; description?: string };
type PermDefCategory = { id: string; name: string; label: string; description?: string; permissions: PermDefItem[] };

// Same list as UserInfo: only permissions NOT in this set show [WIP]
const IMPLEMENTED_PERMISSIONS = new Set([
  'users:read', 'users:write',
  'timesheet:read', 'timesheet:write', 'timesheet:approve', 'timesheet:unrestricted_clock',
  'clients:read', 'clients:write',
  'inventory:read', 'inventory:write',
  'reviews:read', 'reviews:admin',
  'hr:access',
  'hr:users:read', 'hr:users:write',
  'hr:users:view:general', 'hr:users:view:job:compensation', 'hr:users:edit:general',
  'hr:users:view:timesheet', 'hr:users:edit:timesheet', 'hr:users:view:permissions', 'hr:users:view:activity', 'hr:users:edit:permissions',
  'hr:attendance:read', 'hr:attendance:write',
  'hr:community:read', 'hr:community:write',
  'hr:reviews:admin',
  'hr:timesheet:read', 'hr:timesheet:write', 'hr:timesheet:approve', 'hr:timesheet:unrestricted_clock',
  'settings:access',
  'documents:access',
  'documents:read', 'documents:write', 'documents:delete', 'documents:move',
  'fleet:access',
  'fleet:vehicles:read', 'fleet:vehicles:write',
  'fleet:equipment:read', 'fleet:equipment:write',
  'inventory:access',
  'inventory:suppliers:read', 'inventory:suppliers:write',
  'inventory:products:read', 'inventory:products:write',
  'business:access',
  'business:customers:read', 'business:customers:write',
  'business:projects:read', 'business:projects:write',
  'business:projects:reports:read', 'business:projects:reports:write',
  'business:projects:workload:read', 'business:projects:workload:write',
  'business:projects:timesheet:read', 'business:projects:timesheet:write',
  'business:projects:files:read', 'business:projects:files:write',
  'business:projects:documents:read', 'business:projects:documents:write',
  'business:projects:proposal:read', 'business:projects:proposal:write',
  'business:projects:estimate:read', 'business:projects:estimate:write',
  'business:projects:orders:read', 'business:projects:orders:write',
  'business:projects:safety:read', 'business:projects:safety:write',
  'sales:access',
  'sales:quotations:read', 'sales:quotations:write',
]);

function PermissionTemplatesSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['permission-templates'],
    queryFn: () => api<PermTemplate[]>('GET', '/permissions/templates'),
  });
  const { data: definitions = [] } = useQuery({
    queryKey: ['permission-definitions'],
    queryFn: () => api<PermDefCategory[]>('GET', '/permissions/definitions'),
  });
  const [newName, setNewName] = useState('');
  const [newSelectedKeys, setNewSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { name: string; selectedKeys: Set<string> }>>({});
  // Expandable categories for permission list (same as UserInfo): start collapsed
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Process definitions like UserInfo: split business into Services + Business, add Sales
  const processedDefinitions = useMemo(() => {
    const raw = (definitions || []) as PermDefCategory[];
    const processed: PermDefCategory[] = [];
    let businessCat: PermDefCategory | null = null;
    let inventoryCat: PermDefCategory | null = null;
    raw.forEach((cat) => {
      if (cat.name === 'business') {
        const hasProjects = (cat.permissions || []).some((p) => p.key.includes('business:projects'));
        const hasCustomers = (cat.permissions || []).some((p) => p.key.includes('business:customers'));
        if (hasProjects) {
          processed.push({
            ...cat,
            id: 'services',
            name: 'services',
            label: 'Services',
            description: cat.description || 'Permissions for Business area. Blocking access blocks all sub-permissions.',
            permissions: (cat.permissions || []).filter((p) => p.key.includes('business:projects')),
          });
        }
        if (hasCustomers) {
          businessCat = { ...cat, permissions: (cat.permissions || []).filter((p) => p.key.includes('business:customers')) };
        }
      } else if (cat.name === 'inventory') {
        inventoryCat = cat;
      } else if (cat.name === 'sales') {
        processed.push(cat);
      } else {
        processed.push(cat);
      }
    });
    if (businessCat || inventoryCat) {
      const combined = [
        ...(businessCat?.permissions || []),
        ...(inventoryCat?.permissions || []),
      ];
      if (combined.length > 0) {
        const insert = {
          id: 'business',
          name: 'business',
          label: 'Business',
          description: inventoryCat?.description || 'Permissions for Business area. Blocking access blocks all sub-permissions.',
          permissions: combined,
        };
        const idx = processed.findIndex((c) => c.name === 'services');
        if (idx >= 0) processed.splice(idx + 1, 0, insert);
        else processed.unshift(insert);
      }
    }
    const hasSales = processed.some((c) => c.name === 'sales');
    if (!hasSales) {
      const salesCat: PermDefCategory = {
        id: 'sales',
        name: 'sales',
        label: 'Sales',
        description: 'Permissions for Sales area. Blocking access blocks all sub-permissions.',
        permissions: [],
      };
      const idx = processed.findIndex((c) => c.name === 'business');
      if (idx >= 0) processed.splice(idx + 1, 0, salesCat);
      else processed.push(salesCat);
    }
    return processed;
  }, [definitions]);


  const toggleKey = (key: string, set: Set<string>) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  // Same as UserInfo: whether this permission can be enabled given current selection (dependencies met)
  const canEnableEditPermission = (permKey: string, selectedKeys: Set<string>): boolean => {
    const has = (k: string) => selectedKeys.has(k);
    if (permKey === 'hr:users:view:general' || permKey === 'hr:users:view:timesheet' || permKey === 'hr:users:view:permissions' || permKey === 'hr:users:view:activity') {
      return has('hr:users:read');
    }
    if (permKey === 'hr:users:view:job:compensation') {
      return has('hr:users:read') && has('hr:users:view:general');
    }
    if (permKey === 'hr:users:write') {
      return has('hr:users:read');
    }
    if (permKey === 'business:projects:write') {
      return has('business:projects:read');
    }
    if (permKey === 'business:customers:write') {
      return has('business:customers:read');
    }
    if (permKey === 'sales:quotations:write') {
      return has('sales:quotations:read');
    }
    if (permKey === 'hr:users:edit:general') {
      return has('hr:users:read') && has('hr:users:view:general');
    }
    if (permKey === 'hr:users:edit:timesheet') {
      return has('hr:users:read') && has('hr:users:view:timesheet');
    }
    if (permKey === 'hr:users:edit:permissions') {
      return has('hr:users:read') && has('hr:users:view:permissions');
    }
    if (permKey.startsWith('business:projects:') && permKey.endsWith(':read') && permKey !== 'business:projects:read') {
      return has('business:projects:read');
    }
    if (permKey.startsWith('business:projects:') && permKey.endsWith(':write') && permKey !== 'business:projects:write') {
      return has(permKey.replace(':write', ':read'));
    }
    return true;
  };

  // When unchecking a key, remove dependent keys (same cascade as UserInfo)
  const applyCascadeUncheck = (uncheckedKey: string, current: Set<string>): Set<string> => {
    const next = new Set(current);
    const remove = (k: string) => next.delete(k);
    if (uncheckedKey === 'hr:users:view:general') {
      remove('hr:users:edit:general');
      remove('hr:users:view:job:compensation');
    } else if (uncheckedKey === 'hr:users:view:timesheet') {
      remove('hr:users:edit:timesheet');
    } else if (uncheckedKey === 'hr:users:view:permissions') {
      remove('hr:users:edit:permissions');
    } else if (uncheckedKey === 'hr:users:read') {
      remove('hr:users:write');
      remove('hr:users:view:general');
      remove('hr:users:view:job:compensation');
      remove('hr:users:view:timesheet');
      remove('hr:users:view:permissions');
      remove('hr:users:view:activity');
      remove('hr:users:edit:general');
      remove('hr:users:edit:timesheet');
      remove('hr:users:edit:permissions');
    } else if (uncheckedKey === 'business:customers:read') {
      remove('business:customers:write');
    } else if (uncheckedKey === 'sales:quotations:read') {
      remove('sales:quotations:write');
    } else if (uncheckedKey === 'business:projects:read') {
      remove('business:projects:write');
      remove('business:projects:reports:read');
      remove('business:projects:workload:read');
      remove('business:projects:timesheet:read');
      remove('business:projects:files:read');
      remove('business:projects:proposal:read');
      remove('business:projects:estimate:read');
      remove('business:projects:orders:read');
      remove('business:projects:safety:read');
    } else if (uncheckedKey === 'business:projects:write') {
      remove('business:projects:reports:write');
      remove('business:projects:workload:write');
      remove('business:projects:timesheet:write');
      remove('business:projects:files:write');
      remove('business:projects:proposal:write');
      remove('business:projects:estimate:write');
      remove('business:projects:orders:write');
      remove('business:projects:safety:write');
    } else if (uncheckedKey.startsWith('business:projects:') && uncheckedKey.endsWith(':read') && uncheckedKey !== 'business:projects:read') {
      remove(uncheckedKey.replace(':read', ':write'));
    }
    return next;
  };

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; permission_keys: string[] }) =>
      api('POST', '/permissions/templates', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-templates'] });
      setNewName('');
      setNewSelectedKeys(new Set());
      toast.success('Permission template created');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; name?: string; permission_keys?: string[] }) =>
      api('PUT', `/permissions/templates/${payload.id}`, { name: payload.name, permission_keys: payload.permission_keys }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-templates'] });
      setEdits({});
      setExpandedId(null);
      toast.success('Updated');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api('DELETE', `/permissions/templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-templates'] });
      setExpandedId(null);
      setEdits({});
      toast.success('Deleted');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api('POST', `/permissions/templates/${id}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-templates'] });
      toast.success('Template duplicated');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to duplicate'),
  });

  const getEdit = (t: PermTemplate) => {
    const e = edits[t.id];
    if (e) return e;
    return { name: t.name, selectedKeys: new Set(t.permission_keys || []) };
  };

  // Same layout as UserInfo permissions: expandable sections with chevron, VIEW/EDIT columns, same classes
  const renderPermissionCheckboxes = (
    selectedKeys: Set<string>,
    onChange: (next: Set<string>) => void,
    disabled?: boolean
  ) => {
    const toggleExpand = (categoryId: string) => {
      setExpandedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(categoryId)) next.delete(categoryId);
        else next.add(categoryId);
        return next;
      });
    };
    const handlePermToggle = (key: string) => {
      let next = toggleKey(key, selectedKeys);
      if (!next.has(key)) next = applyCascadeUncheck(key, next);
      onChange(next);
    };
    const permRow = (perm: PermDefItem, indent = false) => {
      const isChecked = selectedKeys.has(perm.key);
      const canEnable = canEnableEditPermission(perm.key, selectedKeys);
      const checkboxDisabled = disabled || (!isChecked && !canEnable);
      return (
        <label
          key={perm.id}
          className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${checkboxDisabled ? 'cursor-default' : 'hover:bg-gray-50 cursor-pointer'} ${indent ? 'ml-4' : ''}`}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => handlePermToggle(perm.key)}
            disabled={checkboxDisabled}
            className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
              <span className="truncate">{perm.label}</span>
              {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">[WIP]</span>
              )}
            </div>
            {perm.description && (
              <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
            )}
          </div>
        </label>
      );
    };
    const viewEditBlock = (viewPerms: PermDefItem[], editPerms: PermDefItem[], subViewIndent = false, subEditIndent = false) => (
      <div className="grid md:grid-cols-2 gap-2.5">
        {viewPerms.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
            {viewPerms.map((p) => permRow(p, subViewIndent))}
          </div>
        )}
        {editPerms.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
            {editPerms.map((p) => permRow(p, subEditIndent))}
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-6">
        {processedDefinitions.map((cat) => {
          const areaAccessPerm = (cat.permissions || []).find((p) => p.key.endsWith(':access'));
          const subPermissions = (cat.permissions || []).filter((p) => !p.key.endsWith(':access'));
          const isExpanded = expandedCategories.has(cat.id);

          return (
            <div key={cat.id} className="border rounded-lg overflow-hidden">
              {/* Expandable header with chevron (same as UserInfo) */}
              <div
                className="p-3 cursor-pointer hover:bg-gray-50 transition-colors flex items-center gap-2"
                onClick={() => toggleExpand(cat.id)}
              >
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  <svg
                    className={`w-3 h-3 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-semibold text-gray-900">{cat.label}</h4>
                  {cat.description && (
                    <p className="text-[10px] text-gray-500 mt-0.5">{cat.description}</p>
                  )}
                </div>
              </div>

              {isExpanded && subPermissions.length > 0 && (
                <div className="px-4 pb-4 border-t border-gray-200 pt-3 mt-0">
                  {cat.name === 'services' ? (
                    /* Projects & Opportunities */
                    (() => {
                      const all = subPermissions.filter((p) => p.key.includes('business:projects'));
                      if (all.length === 0) return null;
                      const mainView = all.find((p) => p.key === 'business:projects:read');
                      const mainEdit = all.find((p) => p.key === 'business:projects:write');
                      const subView = all.filter((p) => p.key.includes(':read') && p.key !== 'business:projects:read' && (p.key.includes(':reports:') || p.key.includes(':workload:') || p.key.includes(':timesheet:') || p.key.includes(':files:') || p.key.includes(':documents:') || p.key.includes(':proposal:') || p.key.includes(':estimate:') || p.key.includes(':orders:')));
                      const subEdit = all.filter((p) => p.key.includes(':write') && p.key !== 'business:projects:write' && (p.key.includes(':reports:') || p.key.includes(':workload:') || p.key.includes(':timesheet:') || p.key.includes(':files:') || p.key.includes(':documents:') || p.key.includes(':proposal:') || p.key.includes(':estimate:') || p.key.includes(':orders:')));
                      return (
                        <div className="border rounded-lg p-2.5 bg-gray-50">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Projects & Opportunities</div>
                          <div className="grid md:grid-cols-2 gap-2.5">
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
                              {mainView && permRow(mainView)}
                              {subView.map((p) => permRow(p, true))}
                            </div>
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
                              {mainEdit && permRow(mainEdit)}
                              {subEdit.map((p) => permRow(p, true))}
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : cat.name === 'business' ? (
                    <div className="space-y-4">
                      {(() => {
                        const areaPerms = subPermissions.filter((p) => p.key.includes('business:customers'));
                        if (areaPerms.length === 0) return null;
                        const v = areaPerms.filter((p) => p.key.includes(':read'));
                        const e = areaPerms.filter((p) => p.key.includes(':write'));
                        return (
                          <div className="border rounded-lg p-2.5 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-700 mb-2">Customers</div>
                            {viewEditBlock(v, e)}
                          </div>
                        );
                      })()}
                      {['suppliers', 'products'].map((area) => {
                        const areaPerms = subPermissions.filter((p) => p.key.includes(`inventory:${area}`));
                        if (areaPerms.length === 0) return null;
                        const viewPerms = areaPerms.filter((p) => p.key.includes(':read'));
                        const editPerms = areaPerms.filter((p) => p.key.includes(':write'));
                        return (
                          <div key={area} className="border rounded-lg p-2.5 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-700 mb-2">{area.charAt(0).toUpperCase() + area.slice(1)}</div>
                            {viewEditBlock(viewPerms, editPerms)}
                          </div>
                        );
                      })}
                    </div>
                  ) : cat.name === 'human_resources' ? (
                    <div className="space-y-4">
                      {['users', 'attendance', 'community', 'reviews', 'timesheet'].map((area) => {
                        const areaPerms = subPermissions.filter((p) => p.key.includes(`hr:${area}`));
                        if (areaPerms.length === 0) return null;
                        const viewPerms = areaPerms.filter((p) => {
                          const k = p.key;
                          return k.includes(':view:') || (k.includes(':read') && !k.includes(':write') && !k.includes(':edit:'));
                        });
                        const editPerms = areaPerms.filter((p) => {
                          const k = p.key;
                          return k.includes(':edit:') || (k.includes(':write') && !k.includes(':view:')) || k.includes(':admin') || k.includes(':unrestricted') || k.includes(':approve');
                        });
                        return (
                          <div key={area} className="border rounded-lg p-2.5 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-700 mb-2">{area.charAt(0).toUpperCase() + area.slice(1)}</div>
                            {viewEditBlock(viewPerms, editPerms)}
                          </div>
                        );
                      })}
                    </div>
                  ) : cat.name === 'fleet' ? (
                    <div className="space-y-4">
                      {['vehicles', 'equipment'].map((area) => {
                        const areaPerms = subPermissions.filter((p) => p.key.includes(`fleet:${area}`));
                        if (areaPerms.length === 0) return null;
                        const viewPerms = areaPerms.filter((p) => p.key.includes(':read'));
                        const editPerms = areaPerms.filter((p) => p.key.includes(':write'));
                        return (
                          <div key={area} className="border rounded-lg p-2.5 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-700 mb-2">{area.charAt(0).toUpperCase() + area.slice(1)}</div>
                            {viewEditBlock(viewPerms, editPerms)}
                          </div>
                        );
                      })}
                    </div>
                  ) : cat.name === 'sales' ? (
                    /* Sales: Quotations (same as UserInfo) */
                    <div className="space-y-4">
                      {['quotations'].map((area) => {
                        const areaPerms = subPermissions.filter((p) => p.key.includes(`sales:${area}`));
                        if (areaPerms.length === 0) return null;
                        const viewPerms = areaPerms.filter((p) => p.key.includes(':read'));
                        const editPerms = areaPerms.filter((p) => p.key.includes(':write'));
                        return (
                          <div key={area} className="border rounded-lg p-2.5 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-700 mb-2">Quotations</div>
                            {viewEditBlock(viewPerms, editPerms)}
                          </div>
                        );
                      })}
                      {subPermissions.length === 0 && (
                        <div className="text-[10px] text-gray-500">No permissions in this category.</div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {subPermissions.map((perm) => permRow(perm))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50">
        <h4 className="font-semibold mb-3 text-sm">Create New Template</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Template Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Sales, Field Technician"
              className="border rounded px-3 py-2 text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Permissions (select all that apply)</label>
            {renderPermissionCheckboxes(newSelectedKeys, setNewSelectedKeys)}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => {
                if (!newName.trim()) {
                  toast.error('Template name is required');
                  return;
                }
                createMutation.mutate({
                  name: newName.trim(),
                  permission_keys: Array.from(newSelectedKeys),
                });
              }}
              className="px-4 py-2 rounded bg-brand-red text-white text-sm"
              disabled={createMutation.isPending}
            >
              Create Template
            </button>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-3 text-sm">Existing Templates</h4>
        {loadingTemplates ? (
          <div className="p-4 text-sm text-gray-500 border rounded">Loading...</div>
        ) : (templates as PermTemplate[]).length === 0 ? (
          <div className="p-4 text-sm text-gray-500 border rounded">No permission templates yet</div>
        ) : (
          <div className="space-y-2">
            {(templates as PermTemplate[]).map((t) => {
              const isExpanded = expandedId === t.id;
              const e = getEdit(t);
              return (
                <div key={t.id} className="border rounded-lg bg-white overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="font-medium text-sm text-gray-900">{t.name}</span>
                    <span className="text-xs text-gray-500">
                      {(t.permission_keys || []).length} permission(s)
                    </span>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t bg-gray-50">
                      <div className="space-y-3 pt-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Template Name</label>
                          <input
                            value={e.name}
                            onChange={(ev) =>
                              setEdits((s) => ({
                                ...s,
                                [t.id]: { ...(s[t.id] || e), name: ev.target.value },
                              }))
                            }
                            className="border rounded px-3 py-2 text-sm w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Permissions</label>
                          {renderPermissionCheckboxes(
                            e.selectedKeys,
                            (next) =>
                              setEdits((s) => ({
                                ...s,
                                [t.id]: { ...(s[t.id] || e), selectedKeys: next },
                              }))
                          )}
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() =>
                              updateMutation.mutate({
                                id: t.id,
                                name: e.name,
                                permission_keys: Array.from(e.selectedKeys),
                              })
                            }
                            className="px-3 py-1.5 rounded bg-black text-white text-sm"
                            disabled={updateMutation.isPending}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => duplicateMutation.mutate(t.id)}
                            className="px-3 py-1.5 rounded border text-sm"
                            disabled={duplicateMutation.isPending}
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={async () => {
                              if (!(await confirm({ title: 'Delete template?', description: 'This action cannot be undone.' })))
                                return;
                              deleteMutation.mutate(t.id);
                            }}
                            className="px-3 py-1.5 rounded bg-gray-100 text-sm"
                            disabled={deleteMutation.isPending}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Terms Templates Section Component
function TermsTemplatesSection(){
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: settings, isLoading, refetch } = useQuery({ 
    queryKey:['settings-bundle'], 
    queryFn: ()=>api<Record<string, Item[]>>('GET','/settings') 
  });
  const templates = (settings?.['terms-templates'] || []) as Item[];
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [edits, setEdits] = useState<Record<string, Item>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  
  const toggleTemplate = (templateId: string) => {
    setExpandedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description: string })=>{
      return api('POST', `/settings/terms-templates?label=${encodeURIComponent(payload.name)}&description=${encodeURIComponent(payload.description)}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      setNewTemplateName('');
      setNewTemplateDescription('');
      toast.success('Terms template created');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to create')
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string)=>api('DELETE', `/settings/terms-templates/${encodeURIComponent(id)}`),
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Deleted');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to delete')
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id:string; label?:string; description?:string })=>{
      const params = new URLSearchParams();
      if (payload.label !== undefined) params.set('label', payload.label);
      if (payload.description !== undefined) params.set('description', payload.description);
      return api('PUT', `/settings/terms-templates/${encodeURIComponent(payload.id)}?${params.toString()}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Updated');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to update')
  });

  const getEdit = (it: Item): Item => edits[it.id] || it;

  return (
    <div className="space-y-4">
      {/* Add New Template */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <h4 className="font-semibold mb-3 text-sm">Create New Template</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Template Name</label>
            <input
              value={newTemplateName}
              onChange={e=>setNewTemplateName(e.target.value)}
              placeholder="e.g., Standard Terms, Commercial Terms"
              className="border rounded px-3 py-2 text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Terms Description</label>
            <textarea
              value={newTemplateDescription}
              onChange={e=>setNewTemplateDescription(e.target.value)}
              placeholder="Enter the full terms text..."
              className="border rounded px-3 py-2 text-sm w-full"
              rows={6}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={()=>{
                if(!newTemplateName.trim()){
                  toast.error('Template name is required');
                  return;
                }
                createMutation.mutate({ name: newTemplateName.trim(), description: newTemplateDescription });
              }}
              className="px-4 py-2 rounded bg-brand-red text-white text-sm"
              disabled={createMutation.isPending}
            >
              Create Template
            </button>
          </div>
        </div>
      </div>

      {/* Existing Templates */}
      <div>
        <h4 className="font-semibold mb-3 text-sm">Existing Templates</h4>
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500 border rounded">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 border rounded">No templates created yet</div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => {
              const e = getEdit(template);
              const isExpanded = expandedTemplates.has(template.id);
              return (
                <div key={template.id} className="border rounded-lg bg-white overflow-hidden">
                  {/* Header - Always visible */}
                  <button
                    onClick={() => toggleTemplate(template.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="font-medium text-sm text-gray-900">{template.label || 'Unnamed Template'}</span>
                    <svg 
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {/* Content - Collapsible */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t bg-gray-50">
                      <div className="space-y-3 pt-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Template Name</label>
                          <input
                            value={e.label}
                            onChange={ev=> setEdits(s=>({ ...s, [template.id]: { ...(s[template.id]||template), label: ev.target.value } }))}
                            className="border rounded px-3 py-2 text-sm w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Terms Description</label>
                          <textarea
                            value={e.meta?.description||''} 
                            onChange={ev=> setEdits(s=>({ ...s, [template.id]: { ...(s[template.id]||template), meta: { ...(s[template.id]?.meta||template.meta||{}), description: ev.target.value } } }))}
                            className="border rounded px-3 py-2 text-sm w-full"
                            rows={6}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={async()=>{
                              try{
                                await updateMutation.mutateAsync({
                                  id: template.id,
                                  label: e.label,
                                  description: e.meta?.description||''
                                });
                                setEdits(s=>{ const {[template.id]:_, ...rest} = s; return rest; });
                              }catch(_e){}
                            }}
                            className="px-3 py-1.5 rounded bg-black text-white text-sm"
                            disabled={updateMutation.isPending}
                          >
                            Save
                          </button>
                          <button
                            onClick={async()=>{
                              if(!(await confirm({ title: 'Delete template?', description: 'This action cannot be undone.' }))) return;
                              deleteMutation.mutate(template.id);
                            }}
                            className="px-3 py-1.5 rounded bg-gray-100 text-sm"
                            disabled={deleteMutation.isPending}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Company Files Departments Component
function CompanyFilesDepartments(){
  const qc = useQueryClient();
  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: ()=>api<Item[]>('GET', '/settings/departments')
  });
  const [newDept, setNewDept] = useState('');
  const [edits, setEdits] = useState<Record<string, Item>>({});

  const createMutation = useMutation({
    mutationFn: (label: string)=>api('POST', `/settings/departments?label=${encodeURIComponent(label)}`),
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      setNewDept('');
      toast.success('File category created');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to create')
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string)=>api('DELETE', `/settings/departments/${encodeURIComponent(id)}`),
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Deleted');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to delete')
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id:string; label?:string; sort_index?:number })=>{
      const params = new URLSearchParams();
      if (payload.label !== undefined) params.set('label', payload.label);
      if (payload.sort_index !== undefined) params.set('sort_index', String(payload.sort_index));
      return api('PUT', `/settings/departments/${encodeURIComponent(payload.id)}?${params.toString()}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Updated');
    },
    onError: (e: any)=>toast.error(e?.message || 'Failed to update')
  });

  const sortedDepartments = useMemo(()=>{
    return (departments||[]).slice().sort((a,b)=>(a.sort_index||0)-(b.sort_index||0));
  },[departments]);

  const move = (idx: number, dir: -1|1)=>{
    if (!sortedDepartments) return;
    const next = idx + dir;
    if (next < 0 || next >= sortedDepartments.length) return;
    const a = sortedDepartments[idx], b = sortedDepartments[next];
    updateMutation.mutate({ id: a.id, sort_index: (b.sort_index??0) });
    updateMutation.mutate({ id: b.id, sort_index: (a.sort_index??0) });
  };

  const getEdit = (it: Item): Item => edits[it.id] || it;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={newDept}
          onChange={e=>setNewDept(e.target.value)}
          placeholder="File category name"
          className="border rounded px-2 py-1 text-sm flex-1"
          onKeyDown={e=>{ if(e.key==='Enter' && newDept.trim()){ createMutation.mutate(newDept.trim()); } }}
        />
        <button
          onClick={()=>newDept.trim() && createMutation.mutate(newDept.trim())}
          className="px-3 py-1 rounded bg-brand-red text-white text-sm"
          disabled={createMutation.isPending}
        >
          Add
        </button>
      </div>
      <div className="border rounded divide-y max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 text-sm text-gray-500">Loading...</div>
        ) : sortedDepartments.length === 0 ? (
          <div className="p-3 text-sm text-gray-500">No file categories yet</div>
        ) : (
          sortedDepartments.map((d, i)=> {
            const e = getEdit(d);
            return (
              <div key={d.id} className="px-2 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <button
                    className="px-1.5 py-0.5 border rounded text-xs disabled:opacity-30"
                    disabled={i===0}
                    onClick={()=>move(i,-1)}
                    title="Move up"
                  >↑</button>
                  <button
                    className="px-1.5 py-0.5 border rounded text-xs disabled:opacity-30"
                    disabled={i===sortedDepartments.length-1}
                    onClick={()=>move(i,1)}
                    title="Move down"
                  >↓</button>
                  <input
                    value={e.label}
                    onChange={ev=> setEdits(s=>({ ...s, [d.id]: { ...(s[d.id]||d), label: ev.target.value } }))}
                    onBlur={()=>{
                      const v = edits[d.id]?.label?.trim();
                      if(v && v !== d.label){
                        updateMutation.mutate({ id: d.id, label: v });
                        setEdits(s=>{ const {[d.id]:_, ...rest} = s; return rest; });
                      }
                    }}
                    className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
                  />
                </div>
                <button
                  onClick={()=>{
                    if(confirm(`Delete file category "${d.label}"?`)){
                      deleteMutation.mutate(d.id);
                    }
                  }}
                  className="px-2 py-1 text-xs text-red-600 hover:underline"
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Standard File Categories — stored as settings list `standard_file_categories` (slug, name, meta.icon, meta.description)
function StandardFileCategories(){
  const confirmDlg = useConfirm();
  const qc = useQueryClient();
  const { data: categories, isLoading } = useQuery({
    queryKey: ['file-categories'],
    queryFn: ()=>api<any[]>('GET', '/clients/file-categories')
  });
  const [edits, setEdits] = useState<Record<string, { name?: string; icon?: string; description?: string }>>({});
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📁');
  const [newDesc, setNewDesc] = useState('');

  const sorted = useMemo(()=>{
    return (categories||[]).slice().sort((a:any,b:any)=>(a.sortIndex??0)-(b.sortIndex??0));
  }, [categories]);

  const getEdit = (row: any) => edits[row.itemId] || {};

  const updateMutation = useMutation({
    mutationFn: (payload: { itemId: string; value?: string; icon?: string; description?: string; sort_index?: number })=>{
      const params = new URLSearchParams();
      if (payload.value !== undefined) params.set('value', payload.value);
      if (payload.icon !== undefined) params.set('icon', payload.icon);
      if (payload.description !== undefined) params.set('description', payload.description);
      if (payload.sort_index !== undefined) params.set('sort_index', String(payload.sort_index));
      return api('PUT', `/settings/standard_file_categories/${encodeURIComponent(payload.itemId)}?${params.toString()}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['file-categories'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Saved');
    },
    onError: ()=> toast.error('Failed to save'),
  });

  const createMutation = useMutation({
    mutationFn: (vars: { slug: string; name: string; icon: string; desc: string })=>{
      const slug = vars.slug.trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){
        throw new Error('Invalid id: use lowercase letters, numbers and hyphens only.');
      }
      const params = new URLSearchParams({
        label: slug,
        value: (vars.name.trim() || slug),
      });
      if (vars.icon.trim()) params.set('icon', vars.icon.trim());
      if (vars.desc.trim()) params.set('description', vars.desc.trim());
      return api('POST', `/settings/standard_file_categories?${params.toString()}`);
    },
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['file-categories'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      setNewSlug(''); setNewName(''); setNewIcon('📁'); setNewDesc('');
      toast.success('Category added');
    },
    onError: (e: any)=> toast.error(e?.message || 'Failed to add'),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string)=> api('DELETE', `/settings/standard_file_categories/${encodeURIComponent(itemId)}`),
    onSuccess: ()=>{
      qc.invalidateQueries({ queryKey: ['file-categories'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Deleted');
    },
    onError: ()=> toast.error('Failed to delete'),
  });

  const move = (idx: number, dir: -1|1)=>{
    if (!sorted.length) return;
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[idx], b = sorted[j];
    updateMutation.mutate({ itemId: a.itemId, sort_index: (b.sortIndex ?? 0) });
    updateMutation.mutate({ itemId: b.itemId, sort_index: (a.sortIndex ?? 0) });
  };

  const saveRow = (row: any)=>{
    const e = getEdit(row);
    const name = e.name !== undefined ? e.name : row.name;
    const icon = e.icon !== undefined ? e.icon : row.icon;
    const description = e.description !== undefined ? e.description : (row.description || '');
    updateMutation.mutate({
      itemId: row.itemId,
      value: String(name ?? '').trim() || row.id,
      icon: String(icon ?? '').trim() || '📁',
      description,
    }, {
      onSuccess: ()=> setEdits(s=>{ const { [row.itemId]: _, ...rest } = s; return rest; }),
    });
  };

  return (
    <div className="space-y-2">
      <div className="border rounded p-2 space-y-2 bg-gray-50/80">
        <div className="text-[11px] font-medium text-gray-600">New category</div>
        <div className="grid grid-cols-2 gap-2">
          <input className="border rounded px-2 py-1 text-xs" placeholder="Id (e.g. as-built)" value={newSlug} onChange={e=>setNewSlug(e.target.value)} />
          <input className="border rounded px-2 py-1 text-xs" placeholder="Display / folder name" value={newName} onChange={e=>setNewName(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input className="border rounded px-2 py-1 text-xs w-16 text-center" title="Icon (emoji)" value={newIcon} onChange={e=>setNewIcon(e.target.value)} />
          <input className="border rounded px-2 py-1 text-xs flex-1 min-w-[120px]" placeholder="Description (optional)" value={newDesc} onChange={e=>setNewDesc(e.target.value)} />
          <button
            type="button"
            className="px-2 py-1 rounded bg-brand-red text-white text-xs shrink-0"
            disabled={createMutation.isPending || !newSlug.trim()}
            onClick={()=> createMutation.mutate({ slug: newSlug, name: newName, icon: newIcon, desc: newDesc })}
          >
            Add
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <div className="border rounded divide-y max-h-80 overflow-y-auto">
          {sorted.map((row: any, i: number)=>{
            const e = getEdit(row);
            const name = e.name !== undefined ? e.name : row.name;
            const icon = e.icon !== undefined ? e.icon : row.icon;
            const description = e.description !== undefined ? e.description : (row.description || '');
            return (
              <div key={row.itemId} className="p-2 flex flex-col gap-2 bg-white">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" className="px-1 border rounded text-[10px] disabled:opacity-30" disabled={i===0} onClick={()=>move(i,-1)} title="Move up">↑</button>
                    <button type="button" className="px-1 border rounded text-[10px] disabled:opacity-30" disabled={i===sorted.length-1} onClick={()=>move(i,1)} title="Move down">↓</button>
                  </div>
                  <input
                    className="border rounded px-1.5 py-0.5 text-sm w-10 text-center shrink-0"
                    value={icon}
                    onChange={ev=> setEdits(s=>({ ...s, [row.itemId]: { ...getEdit(row), icon: ev.target.value } }))}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      className="border rounded px-2 py-1 text-sm w-full"
                      value={name}
                      onChange={ev=> setEdits(s=>({ ...s, [row.itemId]: { ...getEdit(row), name: ev.target.value } }))}
                    />
                    <textarea
                      className="border rounded px-2 py-1 text-xs w-full resize-none"
                      rows={2}
                      placeholder="Description"
                      value={description}
                      onChange={ev=> setEdits(s=>({ ...s, [row.itemId]: { ...getEdit(row), description: ev.target.value } }))}
                    />
                    <div className="text-[10px] text-gray-400 font-mono truncate" title="Stored on files as category id — do not change in DB without migration">
                      id: {row.id}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-black text-white text-xs"
                      disabled={updateMutation.isPending}
                      onClick={()=> saveRow(row)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs text-red-600 hover:underline"
                      disabled={deleteMutation.isPending}
                      onClick={async ()=>{
                        const result = await confirmDlg({
                          title: 'Delete category?',
                          message: `Remove "${row.name}" (${row.id}) from the list? Existing files still reference this category id.`,
                          confirmText: 'Delete',
                          cancelText: 'Cancel',
                        });
                        if (result === 'confirm') deleteMutation.mutate(row.itemId);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-gray-500">
        The id is stored on uploaded files; renaming display name or folders does not rewrite existing file rows.
      </p>
    </div>
  );
}


