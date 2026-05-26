'use client';

import Link from 'next/link';
import { useState } from 'react';

interface SidebarProps {
  active: string;
  onLogout?: () => void;
  userEmail?: string;
}

const SPARK_PATH = 'M13 10V3L4 14h7v7l9-11h-7z';

function NavItem({ href, icon, active, badge, onClick, children }: {
  href: string;
  icon: string;
  active: boolean;
  badge?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active ? 'bg-[#e42820]/10 text-[#e42820]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={icon} />
      </svg>
      <span className="flex-1 truncate">{children}</span>
      {badge && (
        <span className="text-[9px] font-bold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
          {badge}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar({ active, onLogout, userEmail }: SidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      {/* ─── Desktop sidebar ─── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-56 bg-white border-r border-gray-200 z-40">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#e42820] flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SPARK_PATH} />
              </svg>
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm tracking-tight block leading-tight">Spicy Studio</span>
              <span className="text-[10px] text-gray-400 leading-tight">by Condimento</span>
            </div>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
          <NavItem
            href="/"
            icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            active={active === '/'}
          >
            Inicio
          </NavItem>
          <p className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Módulos</p>
          <NavItem
            href="/one-shoot"
            icon="M13 10V3L4 14h7v7l9-11h-7z"
            active={active === '/one-shoot'}
            badge="BETA"
          >
            AD FORMULA
          </NavItem>
          <NavItem
            href="/anuncios"
            icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            active={active === '/anuncios'}
          >
            Anuncios
          </NavItem>
          <NavItem
            href="/redes"
            icon="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            active={active === '/redes'}
          >
            Redes
          </NavItem>
          <NavItem
            href="/pdp"
            icon="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            active={active === '/pdp'}
          >
            PDP
          </NavItem>
          <NavItem
            href="/email"
            icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            active={active === '/email'}
            badge="Pronto"
          >
            Email
          </NavItem>
        </nav>

        {/* Settings + logout */}
        <div className="px-2.5 py-4 border-t border-gray-200 space-y-0.5">
          <p className="px-3 pb-2 text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Ajustes</p>
          <NavItem
            href="/crear-marca"
            icon="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            active={active === '/crear-marca'}
            badge="Nuevo"
          >
            Crear Marca
          </NavItem>
          <NavItem
            href="/config"
            icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
            active={active === '/config'}
          >
            Mi marca
          </NavItem>
          <NavItem
            href="/perfil"
            icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            active={active === '/perfil'}
          >
            Perfil
          </NavItem>
          {onLogout && (
            <button
              onClick={onLogout}
              title={userEmail}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all mt-0.5"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Salir
            </button>
          )}
        </div>
      </aside>

      {/* ─── Mobile top bar ─── */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-40">
        {/* Brand logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#e42820] flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SPARK_PATH} />
            </svg>
          </div>
          <div>
            <span className="font-bold text-gray-900 text-sm tracking-tight block leading-tight">Spicy Studio</span>
            <span className="text-[10px] text-gray-400 leading-tight">by Condimento</span>
          </div>
        </div>

        {/* Hamburger button */}
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú"
          className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* ─── Mobile drawer overlay ─── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Semi-transparent backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDrawer}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <div className="relative flex flex-col w-72 max-w-[85vw] h-full bg-white shadow-xl z-10">
            {/* Drawer header */}
            <div className="px-4 py-5 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#e42820] flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SPARK_PATH} />
                  </svg>
                </div>
                <div>
                  <span className="font-bold text-gray-900 text-sm tracking-tight block leading-tight">Spicy Studio</span>
                  <span className="text-[10px] text-gray-400 leading-tight">by Condimento</span>
                </div>
              </div>
              {/* Close button */}
              <button
                onClick={closeDrawer}
                aria-label="Cerrar menú"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drawer primary nav */}
            <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
              <NavItem
                href="/"
                icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                active={active === '/'}
                onClick={closeDrawer}
              >
                Inicio
              </NavItem>
              <p className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Módulos</p>
              <NavItem
                href="/one-shoot"
                icon="M13 10V3L4 14h7v7l9-11h-7z"
                active={active === '/one-shoot'}
                badge="Nuevo"
                onClick={closeDrawer}
              >
                AD FORMULA
              </NavItem>
              <NavItem
                href="/anuncios"
                icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                active={active === '/anuncios'}
                onClick={closeDrawer}
              >
                Anuncios
              </NavItem>
              <NavItem
                href="/redes"
                icon="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                active={active === '/redes'}
                onClick={closeDrawer}
              >
                Redes
              </NavItem>
              <NavItem
                href="/pdp"
                icon="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                active={active === '/pdp'}
                onClick={closeDrawer}
              >
                PDP
              </NavItem>
              <NavItem
                href="/email"
                icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                active={active === '/email'}
                badge="Pronto"
                onClick={closeDrawer}
              >
                Email
              </NavItem>
            </nav>

            {/* Drawer settings + logout */}
            <div className="px-2.5 py-4 border-t border-gray-200 space-y-0.5">
              <p className="px-3 pb-2 text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Ajustes</p>
              <NavItem
                href="/crear-marca"
                icon="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                active={active === '/crear-marca'}
                badge="Nuevo"
                onClick={closeDrawer}
              >
                Crear Marca
              </NavItem>
              <NavItem
                href="/config"
                icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
                active={active === '/config'}
                onClick={closeDrawer}
              >
                Mi marca
              </NavItem>
              <NavItem
                href="/perfil"
                icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                active={active === '/perfil'}
                onClick={closeDrawer}
              >
                Perfil
              </NavItem>
              {onLogout && (
                <button
                  onClick={() => { closeDrawer(); onLogout(); }}
                  title={userEmail}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all mt-0.5"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Salir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
