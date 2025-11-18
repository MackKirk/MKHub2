import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';

type Folder = { id: string; name: string; parent_id?: string; sort_index?: number; access_permissions?: any; created_at?: string; last_modified?: string };
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
  const [previewImage, setPreviewImage] = useState<{ url:string, name:string, downloadUrl?:string }|null>(null);
  const [permissionsFolder, setPermissionsFolder] = useState<{id:string, name:string}|null>(null);
  const [permissionsData, setPermissionsData] = useState<any>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [uploadQueue, setUploadQueue] = useState<Array<{id:string, file:File, title?:string, progress:number, status:'pending'|'uploading'|'success'|'error', error?:string}>>([]);
  const [isDragging, setIsDragging] = useState(false);

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
    if (!previewPdf && !previewImage) return;
    const onKey = (e: KeyboardEvent)=>{ 
      if(e.key==='Escape') {
        setPreviewPdf(null);
        setPreviewImage(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [previewPdf, previewImage]);

  const topFolders = useMemo(()=>{
    if(activeFolderId !== 'all') return [];
    // When a department is selected, show all folders returned (they're already filtered by backend)
    // When no department is selected, show only root folders (no parent)
    if(selectedDept) {
      return folders || [];
    }
    return (folders||[]).filter(f=> !f.parent_id);
  }, [folders, activeFolderId, selectedDept]);

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

  const uploadSingleFile = async(file:File, customTitle?:string, folderId?:string)=>{
    const targetFolderId = folderId || activeFolderId;
    if(targetFolderId==='all'){
      throw new Error('Select a folder first');
    }
    const name = file.name;
    const type = file.type||'application/octet-stream';
    
    try{
      // Step 1: Get upload URL
      const up:any = await api('POST','/files/upload',{
        original_name:name,
        content_type:type,
        client_id:null,
        project_id:null,
        employee_id:null,
        category_id:'company-files'
      });
      
      if(!up?.upload_url){
        throw new Error('Failed to get upload URL from server');
      }
      
      if(!up?.key){
        throw new Error('Failed to get upload key from server');
      }
      
      console.log('Upload URL received:', {
        url: up.upload_url?.substring(0, 100) + '...',
        key: up.key,
        fileName: name
      });
      
      // Step 2: Upload to Azure Blob Storage (try direct first, fallback to proxy)
      let conf: any;
      try{
        // Try direct upload first
        const putResp = await fetch(up.upload_url,{
          method:'PUT',
          headers:{ 
            'Content-Type':type,
            'x-ms-blob-type':'BlockBlob' 
          },
          body:file
        });
        
        if(!putResp.ok){
          let errorText = 'Unknown error';
          try{
            errorText = await putResp.text();
          }catch(_e){
            // Ignore error reading response
          }
          throw new Error(`Azure upload failed: ${putResp.status} ${putResp.statusText} - ${errorText}`);
        }
        
        // Step 3: Confirm upload
        conf = await api('POST','/files/confirm',{
          key:up.key,
          size_bytes:file.size,
          checksum_sha256:'na',
          content_type:type
        });
      }catch(fetchError:any){
        // If direct upload fails (likely CORS), use proxy endpoint
        console.warn('Direct upload failed, using proxy:', fetchError?.message);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('original_name', name);
        formData.append('content_type', type);
        formData.append('client_id', '');
        formData.append('project_id', '');
        formData.append('employee_id', '');
        formData.append('category_id', 'company-files');
        
        try{
          conf = await api('POST', '/files/upload-proxy', formData);
        }catch(proxyError:any){
          throw new Error(`Upload failed (both direct and proxy): ${proxyError?.message || 'Unknown error'}`);
        }
      }
      
      if(!conf?.id){
        throw new Error('Failed to confirm upload - no file ID returned');
      }
      
      // Step 4: Create document record
      await api('POST', '/company/files/documents', {
        folder_id: targetFolderId,
        title: customTitle||name,
        file_id: conf.id
      });
      
      return { success: true };
    }catch(e:any){
      const errorMsg = e?.message || String(e) || 'Upload failed';
      console.error('Upload error:', errorMsg, e);
      throw new Error(errorMsg);
    }
  };

  const upload = async()=>{
    if(!fileObj){
      toast.error('Select a file');
      return;
    }
    if(activeFolderId==='all'){
      toast.error('Open a folder first');
      return;
    }
    
    const uploadId = `upload-${Date.now()}-${Math.random()}`;
    setUploadQueue(prev=>[...prev, {
      id: uploadId,
      file: fileObj,
      title: title||fileObj.name,
      progress: 0,
      status: 'pending'
    }]);
    
    try{
      setUploadQueue(prev=>prev.map(u=>u.id===uploadId ? {...u, status:'uploading', progress:50} : u));
      await uploadSingleFile(fileObj, title);
      setUploadQueue(prev=>prev.map(u=>u.id===uploadId ? {...u, status:'success', progress:100} : u));
      setShowUpload(false);
      setFileObj(null);
      setTitle('');
      await refetchDocs();
      setTimeout(()=>{
        setUploadQueue(prev=>prev.filter(u=>u.id!==uploadId));
      }, 2000);
    }catch(e:any){
      setUploadQueue(prev=>prev.map(u=>u.id===uploadId ? {...u, status:'error', error:e.message} : u));
      toast.error(e.message || 'Upload failed');
    }
  };

  const uploadMultiple = async(files:FileList|File[], folderId?:string)=>{
    const targetFolderId = folderId || activeFolderId;
    if(targetFolderId==='all'){
      toast.error('Select a folder first');
      return;
    }
    
    const fileArray = Array.from(files);
    const uploads = fileArray.map((file, idx)=>({
      id: `upload-${Date.now()}-${idx}-${Math.random()}`,
      file,
      progress: 0,
      status: 'pending' as const
    }));
    
    setUploadQueue(prev=>[...prev, ...uploads]);
    
    // Upload files sequentially to avoid overwhelming the server
    for(const upload of uploads){
      try{
        setUploadQueue(prev=>prev.map(u=>u.id===upload.id ? {...u, status:'uploading', progress:10} : u));
        await uploadSingleFile(upload.file, undefined, targetFolderId);
        setUploadQueue(prev=>prev.map(u=>u.id===upload.id ? {...u, status:'success', progress:100} : u));
      }catch(e:any){
        const errorMsg = e?.message || 'Upload failed';
        setUploadQueue(prev=>prev.map(u=>u.id===upload.id ? {...u, status:'error', error:errorMsg} : u));
        console.error(`Upload failed for ${upload.file.name}:`, errorMsg);
      }
      // Small delay between uploads to avoid overwhelming the server
      await new Promise(resolve=>setTimeout(resolve, 100));
    }
    
    await refetchDocs();
    
    // Remove successful uploads after 3 seconds, keep errors visible longer
    setTimeout(()=>{
      setUploadQueue(prev=>prev.filter(u=>{
        const upload = uploads.find(up=>up.id===u.id);
        return !upload || u.status === 'error';
      }));
    }, 3000);
  };

  const uploadToFolder = async(folderId:string, file:File)=>{
    const uploadId = `upload-${Date.now()}-${Math.random()}`;
    setUploadQueue(prev=>[...prev, {
      id: uploadId,
      file,
      progress: 0,
      status: 'pending'
    }]);
    
    try{
      setUploadQueue(prev=>prev.map(u=>u.id===uploadId ? {...u, status:'uploading', progress:50} : u));
      await uploadSingleFile(file, undefined, folderId);
      setUploadQueue(prev=>prev.map(u=>u.id===uploadId ? {...u, status:'success', progress:100} : u));
      setTimeout(()=>{
        setUploadQueue(prev=>prev.filter(u=>u.id!==uploadId));
      }, 2000);
    }catch(e:any){
      setUploadQueue(prev=>prev.map(u=>u.id===uploadId ? {...u, status:'error', error:e.message} : u));
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

  const isImage = (ext:string)=>{
    const e = ext.toUpperCase();
    return ['JPG','JPEG','PNG','GIF','WEBP'].includes(e);
  };

  const isPdfOrExcel = (ext:string)=>{
    const e = ext.toUpperCase();
    return ['PDF','XLS','XLSX'].includes(e);
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
          <div 
            className={`flex-1 overflow-y-auto p-4 ${isDragging ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}
            onDragOver={(e)=>{
              e.preventDefault();
              e.stopPropagation();
              if(activeFolderId !== 'all') setIsDragging(true);
            }}
            onDragLeave={(e)=>{
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            }}
            onDrop={async(e)=>{
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              if(activeFolderId === 'all'){
                toast.error('Select a folder first');
                return;
              }
              if(e.dataTransfer.files?.length){
                await uploadMultiple(e.dataTransfer.files);
              }
            }}
          >

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
                    <div className="rounded-lg border overflow-hidden bg-white">
                      {topFolders.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-gray-600">No folders yet. Create one to get started.</div>
                      ) : (
                        topFolders.map((f)=> (
                          <div
                            key={f.id}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                            onDragOver={(e)=>{ e.preventDefault(); }}
                            onDrop={async(e)=>{
                              e.preventDefault();
                              if(e.dataTransfer.files?.length){
                                await uploadMultiple(e.dataTransfer.files, f.id);
                              }
                            }}
                          >
                            <div 
                              className="text-3xl cursor-pointer flex-shrink-0"
                              onClick={()=>setActiveFolderId(f.id)}
                            >
                              📁
                            </div>
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={()=>setActiveFolderId(f.id)}
                            >
                              <div className="font-medium truncate hover:underline">{f.name}</div>
                              <div className="text-[11px] text-gray-600 truncate">
                                {f.last_modified ? (
                                  <>Last modified {String(f.last_modified).slice(0,10)}</>
                                ) : f.created_at ? (
                                  <>Created {String(f.created_at).slice(0,10)}</>
                                ) : (
                                  <>No activity</>
                                )}
                              </div>
                            </div>
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                onClick={(e)=>{
                                  e.stopPropagation();
                                  setPermissionsFolder({id: f.id, name: f.name});
                                }}
                                title="Configure access permissions"
                                className="p-2 rounded hover:bg-gray-100"
                              >🔒</button>
                              <button
                                onClick={(e)=>{
                                  e.stopPropagation();
                                  setRenameFolder({id: f.id, name: f.name});
                                }}
                                title="Rename folder"
                                className="p-2 rounded hover:bg-gray-100"
                              >✏️</button>
                              <button
                                onClick={(e)=>{
                                  e.stopPropagation();
                                  removeFolder(f.id, f.name);
                                }}
                                title="Delete folder"
                                className="p-2 rounded hover:bg-red-50 text-red-600"
                              >🗑️</button>
                            </div>
                          </div>
                        ))
                      )}
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
                    <div className="rounded-lg border overflow-hidden bg-white">
                      {childFolders.map((f)=> (
                        <div
                          key={f.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                          onDragOver={(e)=>{ e.preventDefault(); }}
                          onDrop={async(e)=>{
                            e.preventDefault();
                            if(e.dataTransfer.files?.length){
                              await uploadMultiple(e.dataTransfer.files, f.id);
                            }
                          }}
                        >
                          <div 
                            className="text-3xl cursor-pointer flex-shrink-0"
                            onClick={()=>setActiveFolderId(f.id)}
                          >
                            📁
                          </div>
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={()=>setActiveFolderId(f.id)}
                          >
                            <div className="font-medium truncate hover:underline">{f.name}</div>
                            <div className="text-[11px] text-gray-600 truncate">
                              {f.last_modified ? (
                                <>Last modified {String(f.last_modified).slice(0,10)}</>
                              ) : f.created_at ? (
                                <>Created {String(f.created_at).slice(0,10)}</>
                              ) : (
                                <>No activity</>
                              )}
                            </div>
                          </div>
                          <div className="ml-auto flex items-center gap-1">
                            <button
                              onClick={(e)=>{
                                e.stopPropagation();
                                setPermissionsFolder({id: f.id, name: f.name});
                              }}
                              title="Configure access permissions"
                              className="p-2 rounded hover:bg-gray-100"
                            >🔒</button>
                            <button
                              onClick={(e)=>{
                                e.stopPropagation();
                                setRenameFolder({id: f.id, name: f.name});
                              }}
                              title="Rename folder"
                              className="p-2 rounded hover:bg-gray-100"
                            >✏️</button>
                            <button
                              onClick={(e)=>{
                                e.stopPropagation();
                                removeFolder(f.id, f.name);
                              }}
                              title="Delete folder"
                              className="p-2 rounded hover:bg-red-50 text-red-600"
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
                    const isImg = isImage(ext);
                    const isPreviewable = isPdfOrExcel(ext) || isImg;
                    return (
                      <div key={d.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                        {isImg ? (
                          <div 
                            className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 cursor-pointer flex-shrink-0"
                            onClick={async()=>{
                              try{
                                const r:any = await api('GET', `/files/${encodeURIComponent(d.file_id||'')}/download`);
                                const url=r.download_url||'';
                                if(url) {
                                  setPreviewImage({ url, name: d.title||'Preview', downloadUrl: url });
                                }
                              }catch(_e){
                                toast.error('Preview not available');
                              }
                            }}
                          >
                            <img 
                              src={`/files/${encodeURIComponent(d.file_id||'')}/thumbnail?w=64`}
                              alt={d.title||'Preview'}
                              className="w-full h-full object-cover"
                              onError={(e)=>{
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if(parent){
                                  parent.innerHTML = `<div class="w-full h-full flex items-center justify-center ${s.bg} ${s.txt} text-xs font-bold">${ext||'IMG'}</div>`;
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <div className={`w-10 h-12 rounded-lg ${s.bg} ${s.txt} flex items-center justify-center text-[10px] font-extrabold select-none flex-shrink-0`}>
                            {ext||'FILE'}
                          </div>
                        )}
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={async()=>{
                            if(!isPreviewable) return;
                            try{
                              const r:any = await api('GET', `/files/${encodeURIComponent(d.file_id||'')}/download`);
                              const url=r.download_url||'';
                              if(url) {
                                if(ext === 'PDF') {
                                  setPreviewPdf({ url, name: d.title||'Preview' });
                                } else if(['XLS','XLSX'].includes(ext)) {
                                  // Excel files: use Office Online Viewer
                                  const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
                                  setPreviewPdf({ url: officeUrl, name: d.title||'Preview' });
                                } else if(isImg) {
                                  setPreviewImage({ url, name: d.title||'Preview', downloadUrl: url });
                                } else {
                                  window.open(url,'_blank');
                                }
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e)=>e.target===e.currentTarget && setShowUpload(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="text-lg font-semibold mb-2">Upload Files</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">Files (multiple files supported)</div>
                <input
                  type="file"
                  multiple
                  onChange={async(e)=>{
                    const files = e.target.files;
                    if(files && files.length > 0){
                      setShowUpload(false);
                      await uploadMultiple(Array.from(files));
                    }
                  }}
                  className="w-full"
                />
              </div>
              <div className="text-xs text-gray-500">
                You can also drag and drop files directly onto the folder area
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
            </div>
          </div>
        </div>
      )}

      {/* Upload Progress Modal */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border w-80 max-h-96 overflow-hidden z-50">
          <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
            <div className="font-semibold text-sm">Upload Progress</div>
            <button
              onClick={()=>setUploadQueue([])}
              className="text-gray-500 hover:text-gray-700 text-xs"
            >Clear</button>
          </div>
          <div className="overflow-y-auto max-h-80">
            {uploadQueue.map((u)=>(
              <div key={u.id} className="p-3 border-b">
                <div className="flex items-start gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" title={u.file.name}>{u.file.name}</div>
                    <div className="text-[10px] text-gray-500">
                      {(u.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <div className="text-xs">
                    {u.status === 'pending' && '⏳'}
                    {u.status === 'uploading' && '⏳'}
                    {u.status === 'success' && '✅'}
                    {u.status === 'error' && '❌'}
                  </div>
                </div>
                {u.status === 'uploading' && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                )}
                {u.status === 'success' && (
                  <div className="text-[10px] text-green-600 mt-1">Upload complete</div>
                )}
                {u.status === 'error' && (
                  <div className="text-[10px] text-red-600 mt-1" title={u.error}>{u.error || 'Upload failed'}</div>
                )}
              </div>
            ))}
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
                      if(newFolderParentId) {
                        body.parent_id = newFolderParentId;
                      } else if(selectedDept) {
                        body.department_id = selectedDept;
                      }
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
                    if(newFolderParentId) {
                      body.parent_id = newFolderParentId;
                    } else if(selectedDept) {
                      body.department_id = selectedDept;
                    }
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

      {/* PDF/Excel Preview Modal */}
      {previewPdf && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" onClick={()=>setPreviewPdf(null)}>
          <div className="w-full h-full flex items-center justify-center p-4 relative">
            <iframe
              src={previewPdf.url}
              className="w-full h-full max-w-6xl max-h-[90vh] border rounded bg-white"
              title={previewPdf.name}
              onClick={(e)=>e.stopPropagation()}
            />
            <div className="absolute top-4 right-4 flex gap-2">
              <a
                href={previewPdf.url}
                download={previewPdf.name}
                className="bg-white text-black px-4 py-2 rounded hover:bg-gray-100 flex items-center gap-2"
                onClick={(e)=>e.stopPropagation()}
              >
                <span>⬇️</span>
                <span>Download</span>
              </a>
              <button
                onClick={()=>setPreviewPdf(null)}
                className="bg-white text-black px-4 py-2 rounded hover:bg-gray-100"
              >
                ✕ Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" onClick={()=>setPreviewImage(null)}>
          <div className="w-full h-full flex items-center justify-center p-4 relative">
            <div className="max-w-7xl max-h-[90vh] flex flex-col items-center">
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                onClick={(e)=>e.stopPropagation()}
              />
              <div className="mt-4 bg-white rounded-lg px-6 py-4 flex items-center gap-4 shadow-lg">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{previewImage.name}</div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={previewImage.downloadUrl || previewImage.url}
                    download={previewImage.name}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
                    onClick={(e)=>e.stopPropagation()}
                  >
                    <span>⬇️</span>
                    <span>Download</span>
                  </a>
                  <button
                    onClick={()=>setPreviewImage(null)}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
