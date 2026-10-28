import type { ReactNode } from 'react';
import { FileText, FolderOpen, HardHat } from 'lucide-react';

const LOGO_SRC = '/ui/assets/login/logo-light.svg';
const LOGIN_BG_SRC = '/ui/assets/login/background.jpg';

const PORTAL_FEATURES = [
  { label: 'Projects', Icon: HardHat },
  { label: 'Files', Icon: FolderOpen },
  { label: 'Documents', Icon: FileText },
] as const;

export default function PortalAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f7f4f3] md:h-dvh md:overflow-hidden">
      <div className="flex min-h-dvh flex-col md:h-full md:flex-row">
        <aside className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#7f1010] to-[#a31414] px-5 py-3.5 text-white md:flex md:w-[42%] md:flex-col md:items-center md:justify-center md:px-10 md:py-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div
            className="pointer-events-none absolute inset-0 hidden bg-cover bg-center grayscale opacity-[0.28] mix-blend-luminosity md:block"
            style={{ backgroundImage: "url('/ui/assets/login/panel-photo.jpg')" }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 hidden bg-gradient-to-t from-[#5c0c0c]/70 via-transparent to-[#7f1010]/20 md:block"
            aria-hidden
          />
          <div className="relative z-10 flex items-center md:hidden">
            <img src={LOGO_SRC} alt="Mack Kirk" className="h-12 w-auto max-w-[70%] object-contain sm:h-14" />
          </div>
          <div className="relative z-10 hidden w-full max-w-sm flex-col items-center text-center md:flex">
            <img
              src={LOGO_SRC}
              alt="Mack Kirk"
              className="h-auto w-[min(100%,18rem)] object-contain lg:w-[min(100%,22rem)] xl:w-[min(100%,26rem)]"
            />
            <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-white/90">Customer Portal</p>
            <ul className="mt-8 grid w-full grid-cols-1 gap-y-3 text-xs font-semibold uppercase tracking-wide text-white/80 sm:grid-cols-3 sm:gap-x-3">
              {PORTAL_FEATURES.map(({ label, Icon }) => (
                <li key={label} className="flex items-center justify-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="relative flex flex-1 flex-col justify-start overflow-y-auto px-5 py-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] md:justify-center md:px-12 md:py-10">
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${LOGIN_BG_SRC}')` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/70 via-white/45 to-[#f7f4f3]/55"
            aria-hidden
          />
          <div className="relative z-10 mx-auto w-full max-w-sm">{children}</div>
        </section>
      </div>
    </div>
  );
}
