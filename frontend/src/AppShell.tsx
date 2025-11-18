import { PropsWithChildren, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function AppShell({ children }: PropsWithChildren){
  const { data:meProfile } = useQuery({ queryKey:['me-profile'], queryFn: ()=>api<any>('GET','/auth/me/profile') });
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const displayName = (meProfile?.profile?.preferred_name) || ([meProfile?.profile?.first_name, meProfile?.profile?.last_name].filter(Boolean).join(' ') || meProfile?.user?.username || 'User');
  const avatarId = meProfile?.profile?.profile_photo_file_id;
  const avatarUrl = avatarId ? `/files/${avatarId}/thumbnail?w=96` : '/ui/assets/login/logo-light.svg';
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 text-white p-4 bg-gradient-to-b from-gray-800 via-gray-700 to-gray-600">
        <div className="flex items-center gap-2 mb-4"><img src="/ui/assets/login/logo-light.svg" className="h-8"/><span className="text-sm text-gray-300">MK Hub</span></div>
        <nav className="flex flex-col gap-2">
          <NavLink to="/home" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Home</NavLink>
          <NavLink to="/profile" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>My Information</NavLink>
          <NavLink to="/customers" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Customers</NavLink>
          <NavLink to="/tasks" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Tasks</NavLink>
          <div className="mt-2 text-[11px] uppercase text-gray-400 px-1">Inventory</div>
          <NavLink to="/inventory/suppliers" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Suppliers</NavLink>
          <NavLink to="/inventory/products" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Products</NavLink>
          <NavLink to="/inventory/orders" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Orders</NavLink>
          <div className="mt-2 text-[11px] uppercase text-gray-400 px-1">Projects</div>
          <NavLink to="/projects" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Projects</NavLink>
          <NavLink to="/proposals" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Proposals</NavLink>
          <NavLink to="/estimates" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Estimates</NavLink>
          <div className="mt-2 text-[11px] uppercase text-gray-400 px-1">Fleet & Equipment</div>
          <NavLink to="/fleet" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Fleet Dashboard</NavLink>
          <NavLink to="/fleet/vehicles" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Vehicles</NavLink>
          <NavLink to="/fleet/heavy-machinery" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Heavy Machinery</NavLink>
          <NavLink to="/fleet/other-assets" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Other Fleet Assets</NavLink>
          <NavLink to="/fleet/equipment" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Equipment</NavLink>
          <NavLink to="/fleet/work-orders" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Work Orders</NavLink>
          <NavLink to="/fleet/inspections" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Inspections</NavLink>
          <div className="mt-2 text-[11px] uppercase text-gray-400 px-1">Documents</div>
          <NavLink to="/company-files" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Company Files</NavLink>
          <div className="mt-2 text-[11px] uppercase text-gray-400 px-1">Settings</div>
          <NavLink to="/users" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Users</NavLink>
          {((me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('reviews:admin')) && (
            <>
              <NavLink to="/reviews/admin" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Reviews Admin</NavLink>
              <NavLink to="/reviews/compare" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Reviews Compare</NavLink>
            </>
          )}
          <NavLink to="/settings" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>System Settings</NavLink>
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="h-14 border-b text-white flex items-center justify-between px-4 bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600">
          <input placeholder="Search" className="w-80 rounded-full px-3 py-1 text-sm bg-[#0c0e11] border border-[#1f242b]"/>
          <div className="relative">
            <button onClick={()=>setOpen(v=>!v)} className="flex items-center gap-3">
              <span className="text-base font-medium max-w-[220px] truncate">{displayName}</span>
              <img src={avatarUrl} className="w-10 h-10 rounded-full border-2 border-brand-red object-cover"/>
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-white text-black shadow-lg z-50">
                <Link to="/profile" onClick={()=>setOpen(false)} className="block px-3 py-2 hover:bg-gray-50">My Information</Link>
                <Link to="/reviews/my" onClick={()=>setOpen(false)} className="block px-3 py-2 hover:bg-gray-50">My Reviews</Link>
                <button onClick={()=>{ localStorage.removeItem('user_token'); location.href='/login'; }} className="w-full text-left px-3 py-2 hover:bg-gray-50">Logout</button>
              </div>
            )}
          </div>
        </div>
        <div className="p-5">{children}</div>
      </main>
    </div>
  );
}


