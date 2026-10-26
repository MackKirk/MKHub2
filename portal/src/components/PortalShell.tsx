import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { HardHat, LogOut, Menu } from 'lucide-react';
import { portalApi, portalLogout } from '@/lib/api';
import { uiCx, uiDropdown, uiUserSelect } from '@/lib/ui';
import PortalGlobalSearch, { type PortalSearchSection } from '@/components/PortalGlobalSearch';

type MeResponse = {
  id: string;
  email: string;
  name?: string | null;
};

const navItems = [{ to: '/', end: true, label: 'Projects', icon: HardHat }];

function initialsFrom(name?: string | null, email?: string | null) {
  const raw = (name || '').trim();
  if (raw) {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return raw.slice(0, 2).toUpperCase();
  }
  const e = (email || '').trim();
  return e ? e.slice(0, 2).toUpperCase() : '?';
}

export default function PortalShell() {
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const navRootRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    portalApi<MeResponse>('GET', '/portal/hub/auth/me')
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!navOpen && !userOpen) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (navOpen && navRootRef.current && !navRootRef.current.contains(t)) setNavOpen(false);
      if (userOpen && userMenuRef.current && !userMenuRef.current.contains(t)) setUserOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [navOpen, userOpen]);

  const displayName = useMemo(() => {
    const n = (me?.name || '').trim();
    if (n) return n;
    return me?.email || 'Account';
  }, [me]);

  const localSections = useMemo((): PortalSearchSection[] => {
    return [
      {
        id: 'pages',
        label: 'Pages',
        items: [
          { type: 'page', id: 'projects', title: 'Projects', subtitle: 'Your projects', href: '/' },
        ],
      },
    ];
  }, []);

  const handleLogout = async () => {
    setUserOpen(false);
    await portalLogout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <header className="relative z-[60] flex h-14 shrink-0 items-center gap-2 border-b border-gray-700/40 bg-gradient-to-r from-gray-700 via-gray-700 to-gray-800 px-3 text-white shadow-sm sm:gap-3 sm:px-5">
        <div className="relative shrink-0" ref={navRootRef}>
          <button
            type="button"
            aria-expanded={navOpen}
            aria-controls="portal-nav-panel"
            aria-haspopup="true"
            onClick={() => {
              setUserOpen(false);
              setNavOpen((v) => !v);
            }}
            className={uiCx(
              'flex h-10 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-black/15 px-3',
              'text-sm font-semibold text-white transition-colors hover:border-white/18 hover:bg-black/25',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40',
              navOpen && 'border-white/20 bg-black/30',
            )}
          >
            <Menu className="h-4 w-4" aria-hidden />
            <span>Menu</span>
          </button>

          {navOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[55] cursor-default bg-black/25"
                aria-label="Close menu"
                onClick={() => setNavOpen(false)}
              />
              <div
                id="portal-nav-panel"
                role="navigation"
                aria-label="Portal menu"
                className="absolute left-0 top-full z-[56] mt-1.5 w-[min(17.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-gray-700/50 text-white shadow-2xl shadow-black/40"
              >
                <div className="relative bg-gradient-to-b from-gray-800/95 via-gray-800 to-gray-900 py-2">
                  <div className="px-3 pb-2 pt-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Customer Portal
                    </div>
                  </div>
                  <nav className="flex flex-col gap-0.5 px-1.5">
                    {navItems.map(({ to, end, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        onClick={() => setNavOpen(false)}
                        className={({ isActive }) =>
                          uiCx(
                            'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                            isActive
                              ? 'bg-brand-red/20 text-white'
                              : 'text-gray-200 hover:bg-white/10 hover:text-white',
                          )
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                        {label}
                      </NavLink>
                    ))}
                  </nav>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <Link to="/" className="hidden min-w-0 shrink-0 sm:block">
          <div className="truncate text-sm font-extrabold tracking-tight text-white">
            MK Hub <span className="font-semibold text-brand-red">·</span>{' '}
            <span className="font-semibold text-gray-300">Portal</span>
          </div>
        </Link>

        <PortalGlobalSearch
          widthClassName="min-w-0 flex-1"
          maxRecents={4}
          compactToggle
          getLocalSections={() => localSections}
        />

        <div className="relative ml-auto shrink-0" ref={userMenuRef}>
          <button
            type="button"
            aria-expanded={userOpen}
            aria-haspopup="menu"
            onClick={() => {
              setNavOpen(false);
              setUserOpen((v) => !v);
            }}
            className="flex h-10 max-w-[min(14rem,40vw)] items-center gap-2 rounded-lg border border-white/10 bg-black/15 px-2 transition-all hover:border-white/18 hover:bg-black/25 sm:max-w-[15rem] sm:pr-3"
          >
            <span
              className={uiCx(
                uiUserSelect.avatarPlaceholder,
                uiUserSelect.avatarSm,
                'border-2 border-gray-500/55 bg-gray-600 text-white shadow-md',
              )}
              aria-hidden
            >
              {initialsFrom(me?.name, me?.email)}
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-white">{displayName}</span>
          </button>
          {userOpen ? (
            <div
              role="menu"
              className={uiCx(
                uiDropdown.menu,
                '!absolute right-0 top-full z-[100050] mt-1 flex w-max min-w-0 max-w-[min(100vw-2rem,16rem)] flex-col !max-h-none py-1',
              )}
            >
              <div className="px-3 py-2 text-right">
                <div className="truncate text-sm font-semibold text-gray-900">{displayName}</div>
                {me?.email ? <div className="truncate text-xs text-gray-500">{me.email}</div> : null}
              </div>
              <div className="my-1 border-t border-gray-100" aria-hidden />
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleLogout()}
                className={uiCx(
                  uiDropdown.option,
                  'flex w-full items-center justify-end gap-2 whitespace-nowrap !text-right text-red-600 hover:bg-red-50',
                )}
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="min-h-0 w-full min-w-0 flex-1 overflow-auto p-5">
        <Outlet />
      </main>
    </div>
  );
}
