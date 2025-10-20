import { PropsWithChildren } from 'react';
import { Link, NavLink } from 'react-router-dom';

export default function AppShell({ children }: PropsWithChildren){
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-brand-black text-white p-4">
        <div className="flex items-center gap-2 mb-4"><img src="/ui/assets/login/logo-light.svg" className="h-8"/><span className="text-sm text-gray-300">MK Hub</span></div>
        <nav className="flex flex-col gap-2">
          <NavLink to="/home" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Home</NavLink>
          <NavLink to="/profile" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>My Information</NavLink>
          <NavLink to="/customers" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Customers</NavLink>
          <div className="mt-2 text-[11px] uppercase text-gray-400 px-1">Inventory</div>
          <NavLink to="/inventory/suppliers" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Suppliers</NavLink>
          <NavLink to="/inventory/products" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Products</NavLink>
          <NavLink to="/inventory/orders" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Orders</NavLink>
          <div className="mt-2 text-[11px] uppercase text-gray-400 px-1">Projects</div>
          <NavLink to="/projects" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Projects</NavLink>
          <NavLink to="/proposals" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>Proposals</NavLink>
          <div className="mt-2 text-[11px] uppercase text-gray-400 px-1">Settings</div>
          <a href="/ui/invite.html" className="px-3 py-2 rounded">Invite Users</a>
          <a href="/ui/users.html" className="px-3 py-2 rounded">Users</a>
          <NavLink to="/settings" className={({isActive})=>`px-3 py-2 rounded ${isActive?'bg-brand-red':''}`}>System Settings</NavLink>
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="h-14 border-b bg-[#0f1114] text-white flex items-center justify-between px-4">
          <input placeholder="Search" className="w-80 rounded-full px-3 py-1 text-sm bg-[#0c0e11] border border-[#1f242b]"/>
          <div className="flex items-center gap-2"><span className="text-sm">user</span><img src="/ui/assets/login/logo-light.svg" className="w-7 h-7 rounded-full border-2 border-brand-red"/></div>
        </div>
        <div className="p-5">{children}</div>
      </main>
    </div>
  );
}


