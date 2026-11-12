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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-gradient-to-r from-[#2a2d31] via-[#222528] to-[#1c1e22] text-white animate-mkFadeUp">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}assets/brand/mkm-logo.png`}
              alt="Mack Kirk Metals"
              className="h-10 w-auto"
            />
          </Link>
          <nav className="ml-2 hidden items-center gap-5 text-sm font-medium text-white/75 md:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'text-white' : 'transition-colors hover:text-white'
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
                  className="hidden px-2 text-sm text-white/75 hover:text-white sm:inline"
                >
                  Account
                </Link>
                <button
                  type="button"
                  className="px-2 text-sm text-white/65 hover:text-white"
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
              <Link to="/login" className="hidden px-2 text-sm text-white/75 hover:text-white sm:inline">
                Sign in
              </Link>
            )}
            <Link
              to="/orders"
              className="rounded-sm border border-white/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide hover:bg-white/10"
            >
              Order now
            </Link>
            <Link
              to="/quote"
              className="rounded-sm bg-metals-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-metals-accentDark"
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
        <div className="h-px bg-gradient-to-r from-transparent via-metals-gold/70 to-transparent" />
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
          <div>
            <img
              src={`${import.meta.env.BASE_URL}assets/brand/mkm-logo.png`}
              alt="Mack Kirk Metals"
              className="h-10 w-auto"
            />
            <p className="mt-3 text-sm leading-relaxed">
              Custom brake forming, roll-formed panels, and trims for BC contractors — from the Langley
              shop floor to your job site.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-metals-gold">
              Since 1908
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Explore</p>
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
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Shop & contact</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>9552 – 198 St</li>
              <li>Langley BC V1M 3C8</li>
              <li>
                <a href="tel:+16042587121" className="hover:text-white">
                  (604) 258-7121
                </a>
              </li>
              <li>
                <a href="mailto:metals@mackkirk.com" className="hover:text-white">
                  metals@mackkirk.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/40">
          <p>© {new Date().getFullYear()} Mack Kirk Metals</p>
          <p className="mt-1 space-x-3">
            <Link to="/terms" className="hover:text-white/70">
              Terms
            </Link>
            <span aria-hidden>·</span>
            <Link to="/privacy" className="hover:text-white/70">
              Privacy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
