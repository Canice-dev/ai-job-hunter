"use client";

import {
  Activity,
  Bookmark,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Send,
  UserRound,
} from "lucide-react";

export type DashboardPage = "home" | "saved" | "applications" | "profile" | "telegram";

type AppSidebarProps = {
  activePage: DashboardPage;
  collapsed: boolean;
  mobileOpen: boolean;
  ownerEmail: string;
  telegramLinked: boolean;
  onCollapse: () => void;
  onNavigate: (page: DashboardPage) => void;
  onSearch: () => void;
  onSignOut: () => void;
  onCloseMobile: () => void;
};

export default function AppSidebar({
  activePage,
  collapsed,
  mobileOpen,
  ownerEmail,
  telegramLinked,
  onCollapse,
  onNavigate,
  onSearch,
  onSignOut,
  onCloseMobile,
}: AppSidebarProps) {
  const ownerInitial = ownerEmail.slice(0, 1).toUpperCase() || "O";

  return (
    <>
      <aside className="sidebar" aria-hidden={collapsed && !mobileOpen}>
        <div className="sidebar-brand-row">
          <a className="brand" href="#top" aria-label="Job Hunter home">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span className="brand-name">job<span className="brand-light">hunter</span></span>
          </a>
          <button
            className="sidebar-collapse-button"
            type="button"
            aria-label="Collapse sidebar"
            aria-expanded={!collapsed}
            onClick={onCollapse}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        <button className="sidebar-search" type="button" onClick={onSearch} title="Search your jobs">
          <Search size={16} aria-hidden="true" />
          <span>Search jobs</span>
        </button>
        <div className="sidebar-label">Workspace</div>
        <nav className="side-nav" aria-label="Main navigation">
          <a className={activePage === "home" ? "nav-item active" : "nav-item"} href="#jobs" onClick={() => onNavigate("home")} title={collapsed ? "Home" : undefined}>
            <LayoutDashboard className="nav-icon" size={18} aria-hidden="true" />
            Home
          </a>
          <a className={activePage === "saved" ? "nav-item active" : "nav-item"} href="#jobs" onClick={() => onNavigate("saved")} title={collapsed ? "Saved jobs" : undefined}>
            <Bookmark className="nav-icon" size={18} aria-hidden="true" />
            Saved jobs
          </a>
          <a className={activePage === "applications" ? "nav-item active" : "nav-item"} href="#jobs" onClick={() => onNavigate("applications")} title={collapsed ? "Applications" : undefined}>
            <Send className="nav-icon" size={18} aria-hidden="true" />
            Applications
          </a>
          <button className={activePage === "profile" ? "nav-item profile-nav-item active" : "nav-item profile-nav-item"} title={collapsed ? "My profile" : undefined} onClick={() => onNavigate("profile")}>
            <UserRound className="nav-icon" size={18} aria-hidden="true" />
            My profile
          </button>
        </nav>

        <div className="sidebar-section-label">Your workspace</div>
        <button className={activePage === "telegram" ? "nav-item telegram-nav-item active" : "nav-item telegram-nav-item"} title={collapsed ? "Telegram connection" : undefined} onClick={() => onNavigate("telegram")}>
          <Activity className="nav-icon" size={18} aria-hidden="true" />
          Telegram connection
          <span className={telegramLinked ? "nav-status-dot linked" : "nav-status-dot"} />
        </button>

        <div className="sidebar-bottom">
          <div className="profile-row">
            <div className="avatar">{ownerInitial}</div>
            <div className="profile-copy">
              <strong>{ownerEmail}</strong>
              <span>Personal account</span>
            </div>
            <button className="sign-out-button" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onCloseMobile} />}
    </>
  );
}
