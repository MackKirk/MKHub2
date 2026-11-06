import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearTokens, getToken, logout } from '@/lib/api';

const nav = [
  { to: '/catalog', label: 'Catalog' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export default function SiteShell() {
  const navigate = useNavigate();
  const loggedIn = Boolean(getToken());

  return (
    <div className="min-h-screen flex flex-col bg-metals-paper text-metals-ink">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-metals-ink/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src="/assets/brand/mkm-logo.png" alt="Mack Kirk Metals" className="h-9 w-auto" />
            <span className="font-display text-lg font-bold uppercase tracking-wide hidden sm:inline">
              Mack Kirk Metals
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-white/80 ml-4">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'text-white' : 'hover:text-white transition-colors'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {loggedIn ? (
              <>
                <Link
                  to="/account"
                  className="hidden sm:inline text-sm text-white/80 hover:text-white px-2"
                >
                  Account
                </Link>
                <button
                  type="button"
                  className="text-sm text-white/70 hover:text-white px-2"
                  onClick={async () => {
                    await logout();
                    clearTokens();
                    navigate('/');
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="hidden sm:inline text-sm text-white/80 hover:text-white px-2">
                Sign in
              </Link>
            )}
            <Link
              to="/orders"
              className="rounded border border-white/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide hover:bg-white/10"
            >
              Order now
            </Link>
            <Link
              to="/quote"
              className="rounded bg-metals-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-metals-accentDark"
            >
              Free estimate
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-metals-ink text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
          <div>
            <p className="font-display text-xl font-bold uppercase text-white">Mack Kirk Metals</p>
            <p className="mt-2 text-sm">Custom metal flashings, panels, and forming for BC contractors.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Explore</p>
            <ul className="mt-3 space-y-2 text-sm">
              {nav.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/quote" className="hover:text-white">
                  Free estimate
                </Link>
              </li>
              <li>
                <Link to="/orders" className="hover:text-white">
                  Order now
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Contact</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>British Columbia, Canada</li>
              <li>
                <a href="mailto:metals@mackkirk.com" className="hover:text-white">
                  metals@mackkirk.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Mack Kirk Metals
        </div>
      </footer>
    </div>
  );
}
