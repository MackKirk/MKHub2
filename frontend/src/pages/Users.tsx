import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';

type User = { id:string, username:string, email?:string, name?:string, roles?:string[], is_active?:boolean, profile_photo_file_id?:string };

export default function Users(){
  const { data, isLoading } = useQuery({ queryKey:['users'], queryFn: ()=>api<User[]>('GET','/users') });
  const arr = data||[];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-2xl font-bold">Users</h1></div>
      <div className="grid md:grid-cols-4 gap-4">
        {isLoading? <div className="h-24 bg-gray-100 animate-pulse rounded"/> : arr.map(u=> (
          <Link key={u.id} to={`/users/${encodeURIComponent(u.id)}`} className="rounded-xl border bg-white p-4 flex items-center gap-3">
            {u.profile_photo_file_id? <img src={`/files/${u.profile_photo_file_id}/thumbnail?w=96`} className="w-12 h-12 rounded-full object-cover"/> : <span className="w-12 h-12 rounded-full bg-gray-200 inline-block"/>}
            <div className="min-w-0">
              <div className="font-semibold truncate">{u.name||u.username}</div>
              <div className="text-sm text-gray-600 truncate">{u.email||''}</div>
              <div className="text-[11px] text-gray-500 truncate">{(u.roles||[]).join(', ')}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}


