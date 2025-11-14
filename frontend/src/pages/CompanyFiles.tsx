import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';

type Folder = { id: string; name: string; parent_id?: string; sort_index?: number; access_permissions?: any };
type Document = { id: string; folder_id?: string; title: string; notes?: string; file_id?: string; created_at?: string };
type Department = { id: string; label: string; sort_index?: number };
type User = { id: string; username: string; email?: string };
type Division = { id: string; label: string };

export default function CompanyFiles(){
  const confirm = useConfirm();
  const qc = useQueryClient();
  
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [fileObj, setFileObj] = useState<File|null>(null);
  const [title, setTitle] = useState<string>('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string|null>(null);
  const [renameFolder, setRenameFolder] = useState<{id:string, name:string}|null>(null);
  const [renameDoc, setRenameDoc] = useState<{id:string, title:string}|null>(null);
  const [moveDoc, setMoveDoc] = useState<{id:string}|null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url:string, name:string }|null>(null);
  const [permissionsFolder, setPermissionsFolder] = useState<{id:string, name:string}|null>(null);
  const [permissionsData, setPermissionsData] = useState<any>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: ()=>api<Department[]>('GET', '/settings/departments')
  });
  
  const { data: folders, refetch: refetchFolders } = useQuery({
    queryKey: ['company-folders', selectedDept, activeFolderId],
    queryFn: ()=>{
      const params = new URLSearchParams();
      if(selectedDept) params.append('department_id', selectedDept);
      if(activeFolderId !== 'all') params.append('parent_id', activeFolderId);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return api<Folder[]>('GET', `/company/files/folders${qs}`);
    }
  });
  
  const { data: docs, refetch: refetchDocs } = useQuery({
    queryKey: ['company-docs', activeFolderId],
    queryFn: ()=>{
      const qs = activeFolderId !== 'all' ? `?folder_id=${encodeURIComponent(activeFolderId)}` : '';
      return api<Document[]>('GET', `/company/files/documents${qs}`);
    },
    enabled: activeFolderId !== 'all'
  });

  const { data: usersOptions } = useQuery({
    queryKey: ['company-users-options'],
    queryFn: ()=>api<User[]>('GET', '/company/files/users-options')
  });

  const { data: divisionsOptions } = useQuery({
    queryKey: ['company-divisions-options'],
    queryFn: ()=>api<Division[]>('GET', '/company/files/divisions-options')
  });

  const { data: folderPermissions, isLoading: loadingPermissions } = useQuery({
    queryKey: ['folder-permissions', permissionsFolder?.id],
    queryFn: ()=>api<any>('GET', `/company/files/folders/${permissionsFolder?.id}/permissions`),
    enabled: !!permissionsFolder?.id,
    onSuccess: (data) => {
      if (data) {
        setPermissionsData(data);
        setIsPublic(data.is_public ?? true);
        setSelectedUserIds(data.allowed_user_ids || []);
        setSelectedDivisions(data.allowed_divisions || []);
      }
    }
  });

  useEffect(()=>{
    if (!previewPdf) return;
    const onKey = (e: KeyboardEvent)=>{ if(e.key==='Escape') setPreviewPdf(null); };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [previewPdf]);

  const topFolders = useMemo(()=>{
    if(activeFolderId !== 'all') return [];
    return (folders||[]).filter(f=> !f.parent_id);
  }, [folders, activeFolderId]);

  const childFolders = useMemo(()=>{
    if(activeFolderId === 'all') return [];
    return (folders||[]).filter(f=> f.parent_id === activeFolderId);
  }, [folders, activeFolderId]);

  const breadcrumb = useMemo(()=>{
    if(activeFolderId==='all') return [] as Folder[];
    const map = new Map<string, Folder>();
    (folders||[]).forEach((f)=> map.set(f.id, f));
    const path:Folder[]=[];
    let cur=map.get(activeFolderId);
    while(cur){
      path.unshift(cur);
      cur=cur.parent_id? map.get(cur.parent_id): undefined;
    }
    return path;
  }, [folders, activeFolderId]);

  const fetchDownloadUrl = async (fid:string)=>{
    try{
      const r:any = await api('GET', `/files/${fid}/download`);
      return String(r.download_url||'');
    }catch(_e){
      toast.error('Download link unavailable');
      return '';
    }
  };

  const upload = async()=>{
    try{
      if(!fileObj){
        toast.error('Select a file');
        return;
      }
      if(activeFolderId==='all'){
        toast.error('Open a folder first');
        return;
      }
      const name=fileObj.name;
      const type=fileObj.type||'application/octet-stream';
      const up=await api('POST','/files/upload',{
        original_name:name,
        content_type:type,
        client_id:null,
        project_id:null,
        employee_id:null,
        category_id:'company-files'
      });
      await fetch(up.upload_url,{
        method:'PUT',
        headers:{ 'Content-Type':type,'x-ms-blob-type':'BlockBlob' },
        body:fileObj
      });
      const conf=await api('POST','/files/confirm',{
        key:up.key,
        size_bytes:fileObj.size,
        checksum_sha256:'na',
        content_type:type
      });
      await api('POST', '/company/files/documents', {
        folder_id: activeFolderId,
        title: title||name,
        file_id: conf.id
      });
      toast.success('Uploaded');
      setShowUpload(false);
      setFileObj(null);
      setTitle('');
      await refetchDocs();
    }catch(_e){
      toast.error('Upload failed');
    }
  };

  const uploadToFolder = async(folderId:string, file:File)=>{
    try{
      const type=file.type||'application/octet-stream';
      const up=await api('POST','/files/upload',{
        original_name:file.name,
        content_type:type,
        client_id:null,
        project_id:null,
        employee_id:null,
        category_id:'company-files'
      });
      await fetch(up.upload_url,{
        method:'PUT',
        headers:{ 'Content-Type':type,'x-ms-blob-type':'BlockBlob' },
        body:file
      });
      const conf=await api('POST','/files/confirm',{
        key:up.key,
        size_bytes:file.size,
        checksum_sha256:'na',
        content_type:type
      });
      await api('POST', '/company/files/documents', {
        folder_id: folderId,
        title: file.name,
        file_id: conf.id
      });
    }catch(_e){
      toast.error('Upload failed');
    }
  };

  const removeFolder = async(id:string, name:string)=>{
    const ok = await confirm({ message: `Delete folder "${name}"?` });
    if(!ok) return;
    try{
      await api('DELETE', `/company/files/folders/${encodeURIComponent(id)}`);
      toast.success('Deleted');
      await refetchFolders();
      if(activeFolderId === id) setActiveFolderId('all');
    }catch(_e){
      toast.error('Delete failed');
    }
  };

  const removeDoc = async(id:string)=>{
    const ok = await confirm({ message: 'Delete this document?' });
    if(!ok) return;
    try{
      await api('DELETE', `/company/files/documents/${encodeURIComponent(id)}`);
      toast.success('Deleted');
      await refetchDocs();
    }catch(_e){
      toast.error('Delete failed');
    }
  };

  const fileExt = (name:string)=> {
    const m = name.match(/\.([^.]+)$/);
    return m ? m[1] : '';
  };

  const extStyle = (ext:string)=>{
    const e = ext.toUpperCase();
    if(['PDF'].includes(e)) return { bg:'bg-red-500', txt:'text-white' };
    if(['DOC','DOCX','XLS','XLSX','PPT','PPTX'].includes(e)) return { bg:'bg-blue-500', txt:'text-white' };
    if(['JPG','JPEG','PNG','GIF','WEBP'].includes(e)) return { bg:'bg-green-500', txt:'text-white' };
    return { bg:'bg-gray-300', txt:'text-gray-800' };
  };

  const filteredUsers = useMemo(()=>{
    if (!usersOptions) return [];
    return usersOptions.filter(u=>
      !userSearch || 
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.email||'').toLowerCase().includes(userSearch.toLowerCase())
    );
  }, [usersOptions, userSearch]);

  const toggleUser = (userId: string)=>{
    setSelectedUserIds(prev=>
      prev.includes(userId) ? prev.filter(id=>id!==userId) : [...prev, userId]
    );
  };

  const toggleDivision = (divId: string)=>{
    setSelectedDivisions(prev=>
      prev.includes(divId) ? prev.filter(id=>id!==divId) : [...prev, divId]
    );
  };

  const savePermissions = async()=>{
    if (!permissionsFolder) return;
    try{
      await api('PUT', `/company/files/folders/${encodeURIComponent(permissionsFolder.id)}/permissions`, {
        is_public: isPublic,
        allowed_user_ids: isPublic ? [] : selectedUserIds,
        allowed_divisions: isPublic ? [] : selectedDivisions
      });
      toast.success('Permissions updated');
      setPermissionsFolder(null);
      qc.invalidateQueries({ queryKey: ['company-folders'] });
      qc.invalidateQueries({ queryKey: ['folder-permissions'] });
    }catch(_e){
      toast.error('Failed to update permissions');
    }
  };

  return (
    <div className="space-y-4">
      <div className="mb-1 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Company Files</div>
        <div className="text-sm opacity-90">Manage company-wide documents organized by file categories.</div>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="flex h-[calc(100vh-200px)]">
          {/* Left Sidebar - File Categories */}
          <div className="w-64 border-r bg-gray-50 flex flex-col">
            <div className="p-4 border-b">
              <div className="text-sm font-semibold text-gray-700 mb-2">File Categories</div>
              {!departments?.length && (
                <div className="text-xs text-gray-500">
                  No categories. <a href="/settings" className="text-brand-red underline">Create one</a>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              <button
                onClick={()=>{
                  setSelectedDept('');
                  setActiveFolderId('all');
                }}
                className={`w-full text-left px-4 py-3 border-b hover:bg-white transition-colors ${
                  !selectedDept ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>📁</span>
                  <span>All Files</span>
                </div>
              </button>
              {(departments||[]).map(d=>(
                <button
                  key={d.id}
                  onClick={()=>{
                    setSelectedDept(d.id);
                    setActiveFolderId('all');
                  }}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-white transition-colors ${
                    selectedDept === d.id ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>🏢</span>
                    <span>{d.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Content Area - Folders and Documents */}
          <div className="flex-1 overflow-y-auto p-4">

            {activeFolderId==='all' ? (
              <>
                {!selectedDept ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-3">📁</div>
                    <div className="text-lg font-semibold mb-2">Select a File Category</div>
                    <div className="text-sm">Please select a file category from the left sidebar to view and manage folders.</div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold">
                        Folders in {(departments||[]).find(d=>d.id===selectedDept)?.label || 'Category'}
                      </div>
                      <button
                        onClick={()=>setNewFolderOpen(true)}
                        className="px-3 py-1.5 rounded bg-brand-red text-white text-sm"
                      >
                        + New Folder
                      </button>
                    </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                  {topFolders.map((f)=> (
                    <div
                      key={f.id}
                      className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center cursor-pointer"
                      onClick={(e)=>{
                        const t=e.target as HTMLElement;
                        if(t.closest('.folder-actions')) return;
                        setActiveFolderId(f.id);
                      }}
                      onDragOver={(e)=>{ e.preventDefault(); }}
                      onDrop={async(e)=>{
                        e.preventDefault();
                        if(e.dataTransfer.files?.length){
                          const arr=Array.from(e.dataTransfer.files);
                          for(const file of arr){
                            await uploadToFolder(f.id, file as File);
                          }
                          toast.success('Uploaded');
                          await refetchDocs();
                        }
                      }}
                    >
                      <div className="text-4xl">📁</div>
                      <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>{f.name}</div>
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 folder-actions flex gap-1">
                        <button
                          onClick={(e)=>{
                            e.stopPropagation();
                            setPermissionsFolder({id: f.id, name: f.name});
                          }}
                          className="p-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-[10px]"
                          title="Configure access permissions"
                        >🔒</button>
                        <button
                          onClick={(e)=>{
                            e.stopPropagation();
                            setRenameFolder({id: f.id, name: f.name});
                          }}
                          className="p-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px]"
                          title="Rename folder"
                        >✏️</button>
                        <button
                          onClick={(e)=>{
                            e.stopPropagation();
                            removeFolder(f.id, f.name);
                          }}
                          className="p-1 rounded bg-red-600 hover:bg-red-700 text-white text-[10px]"
                          title="Delete folder"
                        >🗑️</button>
                      </div>
                    </div>
                  ))}
                    {!topFolders.length && <div className="text-sm text-gray-600 col-span-full">No folders yet. Create one to get started.</div>}
                  </div>
                  </>
                )}
              </>
            ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <button
                title="Back to all folders"
                onClick={()=> setActiveFolderId('all')}
                className="px-2 py-2 rounded-lg border"
              >🏠</button>
              <div className="text-sm font-semibold flex gap-2 items-center">
                {breadcrumb.map((f, idx:number)=> (
                  <span key={f.id} className="flex items-center gap-2">
                    {idx>0 && <span className="opacity-60">/</span>}
                    <button
                      className="underline"
                      onClick={()=> setActiveFolderId(f.id)}
                    >{f.name}</button>
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border">
              <div className="p-4">
                {childFolders.length>0 && (
                  <div className="mb-3">
                    <div className="text-xs text-gray-600 mb-1">Subfolders</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                      {childFolders.map((f)=> (
                        <div
                          key={f.id}
                          className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center cursor-pointer"
                          onClick={(e)=>{
                            const t=e.target as HTMLElement;
                            if(t.closest('.folder-actions')) return;
                            setActiveFolderId(f.id);
                          }}
                          onDragOver={(e)=>{ e.preventDefault(); }}
                          onDrop={async(e)=>{
                            e.preventDefault();
                            if(e.dataTransfer.files?.length){
                              const arr=Array.from(e.dataTransfer.files);
                              for(const file of arr){
                                await uploadToFolder(f.id, file as File);
                              }
                              toast.success('Uploaded');
                              await refetchDocs();
                            }
                          }}
                        >
                          <div className="text-4xl">📁</div>
                          <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>{f.name}</div>
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 folder-actions flex gap-1">
                            <button
                              onClick={(e)=>{
                                e.stopPropagation();
                                setPermissionsFolder({id: f.id, name: f.name});
                              }}
                              className="p-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-[10px]"
                              title="Configure access permissions"
                            >🔒</button>
                            <button
                              onClick={(e)=>{
                                e.stopPropagation();
                                setRenameFolder({id: f.id, name: f.name});
                              }}
                              className="p-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px]"
                              title="Rename folder"
                            >✏️</button>
                            <button
                              onClick={(e)=>{
                                e.stopPropagation();
                                removeFolder(f.id, f.name);
                              }}
                              className="p-1 rounded bg-red-600 hover:bg-red-700 text-white text-[10px]"
                              title="Delete folder"
                            >🗑️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-semibold">Documents</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={()=>{
                        setNewFolderParentId(activeFolderId);
                        setNewFolderOpen(true);
                      }}
                      className="px-3 py-1.5 rounded border text-sm"
                    >
                      + New Subfolder
                    </button>
                    <button
                      onClick={()=>setShowUpload(true)}
                      className="px-3 py-1.5 rounded bg-brand-red text-white text-sm"
                    >
                      + Upload File
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border overflow-hidden bg-white">
                  {(docs||[]).map((d)=>{
                    const ext=fileExt(d.title).toUpperCase();
                    const s=extStyle(ext);
                    return (
                      <div key={d.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                        <div className={`w-10 h-12 rounded-lg ${s.bg} ${s.txt} flex items-center justify-center text-[10px] font-extrabold select-none`}>
                          {ext||'FILE'}
                        </div>
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={async()=>{
                            try{
                              const r:any = await api('GET', `/files/${encodeURIComponent(d.file_id||'')}/download`);
                              const url=r.download_url||'';
                              if(url) {
                                if(ext==='PDF') setPreviewPdf({ url, name: d.title||'Preview' });
                                else window.open(url,'_blank');
                              }
                            }catch(_e){
                              toast.error('Preview not available');
                            }
                          }}
                        >
                          <div className="font-medium truncate hover:underline">{d.title||'Document'}</div>
                          <div className="text-[11px] text-gray-600 truncate">
                            Uploaded {String(d.created_at||'').slice(0,10)}
                          </div>
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            onClick={async()=>{
                              const url = await fetchDownloadUrl(d.file_id||'');
                              if(url) window.open(url,'_blank');
                            }}
                            title="Download"
                            className="p-2 rounded hover:bg-gray-100"
                          >⬇️</button>
                          <button
                            onClick={()=>setRenameDoc({id: d.id, title: d.title})}
                            title="Rename"
                            className="p-2 rounded hover:bg-gray-100"
                          >✏️</button>
                          <button
                            onClick={()=>setMoveDoc({id: d.id})}
                            title="Move"
                            className="p-2 rounded hover:bg-gray-100"
                          >📦</button>
                          <button
                            onClick={()=>removeDoc(d.id)}
                            title="Delete"
                            className="p-2 rounded hover:bg-red-50 text-red-600"
                          >🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                  {!(docs||[]).length && <div className="px-3 py-3 text-sm text-gray-600">No documents in this folder</div>}
                </div>
              </div>
            </div>
          </>
          )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-2">Upload File</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600">File</div>
                <input
                  type="file"
                  onChange={e=> setFileObj(e.target.files?.[0]||null)}
                  className="w-full"
                />
              </div>
              <div>
                <div className="text-xs text-gray-600">Title (optional)</div>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={title}
                  onChange={e=> setTitle(e.target.value)}
                  placeholder="File name will be used if not provided"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={()=>{
                  setShowUpload(false);
                  setFileObj(null);
                  setTitle('');
                }}
                className="px-3 py-2 rounded border"
              >Cancel</button>
              <button
                onClick={upload}
                className="px-3 py-2 rounded bg-brand-red text-white"
              >Upload</button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {newFolderOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">
              {newFolderParentId? 'New Subfolder':'New Folder'}
            </div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input
                className="border rounded px-3 py-2 w-full"
                value={newFolderName}
                onChange={e=> setNewFolderName(e.target.value)}
                onKeyDown={async(e)=>{
                  if(e.key==='Enter'){
                    const name = newFolderName.trim();
                    if(!name){
                      toast.error('Folder name required');
                      return;
                    }
                    try{
                      const body:any = { name };
                      if(newFolderParentId) body.parent_id = newFolderParentId;
                      await api('POST', '/company/files/folders', body);
                      toast.success('Folder created');
                      setNewFolderOpen(false);
                      setNewFolderName('');
                      setNewFolderParentId(null);
                      await refetchFolders();
                    }catch(_e){
                      toast.error('Failed to create folder');
                    }
                  }
                }}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={()=>{
                  setNewFolderOpen(false);
                  setNewFolderName('');
                  setNewFolderParentId(null);
                }}
                className="px-3 py-2 rounded border"
              >Cancel</button>
              <button
                onClick={async()=>{
                  const name = newFolderName.trim();
                  if(!name){
                    toast.error('Folder name required');
                    return;
                  }
                  try{
                    const body:any = { name };
                    if(newFolderParentId) body.parent_id = newFolderParentId;
                    await api('POST', '/company/files/folders', body);
                    toast.success('Folder created');
                    setNewFolderOpen(false);
                    setNewFolderName('');
                    setNewFolderParentId(null);
                    await refetchFolders();
                  }catch(_e){
                    toast.error('Failed to create folder');
                  }
                }}
                className="px-3 py-2 rounded bg-brand-red text-white"
              >Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Move Document Modal */}
      {moveDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e)=>e.target===e.currentTarget && setMoveDoc(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="text-lg font-semibold mb-2">Move Document</div>
            <div>
              <div className="text-xs text-gray-600">Destination folder</div>
              <select
                id="move-doc-select"
                className="border rounded px-3 py-2 w-full"
                defaultValue=""
              >
                <option value="">Root (no folder)</option>
                {(folders||[]).map((f)=> (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={()=>setMoveDoc(null)}
                className="px-3 py-2 rounded border"
              >Cancel</button>
              <button
                onClick={async()=>{
                  try{
                    const sel = document.getElementById('move-doc-select') as HTMLSelectElement;
                    const dest = sel?.value || '';
                    await api('PUT', `/company/files/documents/${encodeURIComponent(moveDoc.id)}`, {
                      folder_id: dest || null
                    });
                    toast.success('Moved');
                    setMoveDoc(null);
                    await refetchDocs();
                  }catch(_e){
                    toast.error('Failed to move');
                  }
                }}
                className="px-3 py-2 rounded bg-brand-red text-white"
              >Move</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {renameFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e)=>e.target===e.currentTarget && setRenameFolder(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="text-lg font-semibold mb-2">Rename Folder</div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input
                id="rename-folder-input"
                className="border rounded px-3 py-2 w-full"
                defaultValue={renameFolder.name}
                onKeyDown={async(e)=>{
                  if(e.key==='Enter'){
                    const input = e.target as HTMLInputElement;
                    const newName = input.value.trim();
                    if(!newName){
                      toast.error('Folder name required');
                      return;
                    }
                    try{
                      await api('PUT', `/company/files/folders/${encodeURIComponent(renameFolder.id)}`, {
                        name: newName
                      });
                      toast.success('Renamed');
                      setRenameFolder(null);
                      await refetchFolders();
                    }catch(_e){
                      toast.error('Failed to rename');
                    }
                  }
                }}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={()=>setRenameFolder(null)}
                className="px-3 py-2 rounded border"
              >Cancel</button>
              <button
                onClick={async()=>{
                  try{
                    const input = document.getElementById('rename-folder-input') as HTMLInputElement;
                    const newName = input?.value?.trim() || '';
                    if(!newName){
                      toast.error('Folder name required');
                      return;
                    }
                    await api('PUT', `/company/files/folders/${encodeURIComponent(renameFolder.id)}`, {
                      name: newName
                    });
                    toast.success('Renamed');
                    setRenameFolder(null);
                    await refetchFolders();
                  }catch(_e){
                    toast.error('Failed to rename');
                  }
                }}
                className="px-3 py-2 rounded bg-brand-red text-white"
              >Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Document Modal */}
      {renameDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e)=>e.target===e.currentTarget && setRenameDoc(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="text-lg font-semibold mb-2">Rename Document</div>
            <div>
              <div className="text-xs text-gray-600">Document title</div>
              <input
                id="rename-doc-input"
                className="border rounded px-3 py-2 w-full"
                defaultValue={renameDoc.title}
                onKeyDown={async(e)=>{
                  if(e.key==='Enter'){
                    const input = e.target as HTMLInputElement;
                    const newTitle = input.value.trim();
                    if(!newTitle){
                      toast.error('Title required');
                      return;
                    }
                    try{
                      await api('PUT', `/company/files/documents/${encodeURIComponent(renameDoc.id)}`, {
                        title: newTitle
                      });
                      toast.success('Renamed');
                      setRenameDoc(null);
                      await refetchDocs();
                    }catch(_e){
                      toast.error('Failed to rename');
                    }
                  }
                }}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={()=>setRenameDoc(null)}
                className="px-3 py-2 rounded border"
              >Cancel</button>
              <button
                onClick={async()=>{
                  try{
                    const input = document.getElementById('rename-doc-input') as HTMLInputElement;
                    const newTitle = input?.value?.trim() || '';
                    if(!newTitle){
                      toast.error('Title required');
                      return;
                    }
                    await api('PUT', `/company/files/documents/${encodeURIComponent(renameDoc.id)}`, {
                      title: newTitle
                    });
                    toast.success('Renamed');
                    setRenameDoc(null);
                    await refetchDocs();
                  }catch(_e){
                    toast.error('Failed to rename');
                  }
                }}
                className="px-3 py-2 rounded bg-brand-red text-white"
              >Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Permissions Modal */}
      {permissionsFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e)=>e.target===e.currentTarget && setPermissionsFolder(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
            <div className="text-lg font-semibold mb-4">Access Permissions: {permissionsFolder.name}</div>
            
            {loadingPermissions ? (
              <div className="py-8 text-center text-gray-500">Loading permissions...</div>
            ) : folderPermissions ? (
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={e=>setIsPublic(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="font-medium">Public (all users can access)</span>
                  </label>
                  <div className="text-xs text-gray-600 mt-1">
                    If unchecked, only selected users and divisions will have access
                  </div>
                </div>

                {!isPublic && (
                  <>
                    <div>
                      <div className="text-sm font-semibold mb-2">Allowed Users</div>
                      <div className="border rounded-lg p-2 max-h-48 overflow-y-auto">
                        <input
                          type="text"
                          placeholder="Search users..."
                          value={userSearch}
                          onChange={e=>setUserSearch(e.target.value)}
                          className="w-full border rounded px-2 py-1 mb-2 text-sm"
                        />
                        <div className="space-y-1">
                          {filteredUsers.map(u=>(
                            <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                              <input
                                type="checkbox"
                                checked={selectedUserIds.includes(u.id)}
                                onChange={()=>toggleUser(u.id)}
                                className="w-4 h-4"
                              />
                              <span className="text-sm">{u.username} {u.email && <span className="text-gray-500">({u.email})</span>}</span>
                            </label>
                          ))}
                          {!filteredUsers.length && (
                            <div className="text-sm text-gray-500 py-2">No users found</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold mb-2">Allowed Divisions</div>
                      <div className="border rounded-lg p-2 max-h-48 overflow-y-auto">
                        {divisionsOptions && divisionsOptions.length > 0 ? (
                          <div className="space-y-1">
                            {divisionsOptions.map(div=>(
                              <label key={div.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={selectedDivisions.includes(div.label)}
                                  onChange={()=>toggleDivision(div.label)}
                                  className="w-4 h-4"
                                />
                                <span className="text-sm">{div.label}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 py-2">No divisions configured</div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <button
                    onClick={()=>setPermissionsFolder(null)}
                    className="px-4 py-2 rounded border"
                  >Cancel</button>
                  <button
                    onClick={savePermissions}
                    className="px-4 py-2 rounded bg-brand-red text-white"
                  >Save</button>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">Failed to load permissions</div>
            )}
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewPdf && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" onClick={()=>setPreviewPdf(null)}>
          <div className="w-full h-full flex items-center justify-center p-4">
            <iframe
              src={previewPdf.url}
              className="w-full h-full max-w-6xl max-h-[90vh] border rounded"
              title={previewPdf.name}
            />
            <button
              onClick={()=>setPreviewPdf(null)}
              className="absolute top-4 right-4 bg-white text-black px-4 py-2 rounded"
            >Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
