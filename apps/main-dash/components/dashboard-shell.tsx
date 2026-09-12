"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useDashboardData } from "@/components/dashboard-data-provider";

type DashboardShellProps = {
  user: {
    name?: string;
    email?: string;
    picture?: string;
  };
  children: ReactNode;
};

export function DashboardShell({ user, children }: DashboardShellProps) {
  const { facility, requests } = useDashboardData();
  const openRequestCount = requests.filter((request) => request.status !== "resolved").length;
  const displayName = user.name || user.email || "Facility staff";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar__top">
          <Link className="brand-lockup" href="/dashboard" aria-label="Tulu dashboard home">
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Tulu</span>
          </Link>
          <span className="workspace-label">Facility workspace</span>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <Link className="sidebar-nav__item sidebar-nav__item--active" href="/dashboard">
            <span className="nav-icon" aria-hidden="true">▤</span>
            <span>Requests</span>
            <span className="nav-count">{openRequestCount}</span>
          </Link>
          <Link className="sidebar-nav__item" href="/dashboard/facility">
            <span className="nav-icon" aria-hidden="true">⌂</span>
            <span>Facility information</span>
          </Link>
        </nav>

        <div className="sidebar__bottom">
          <div className="facility-switcher">
            <span className="facility-switcher__dot" aria-hidden="true" />
            <div>
              <strong>{facility.name}</strong>
              <span>
                {facility.dataSource === "agent_api"
                  ? "Synthetic Agent API snapshot"
                  : facility.dataSource === "local_modified"
                    ? "Synthetic local edits"
                    : "Synthetic local fallback"}
              </span>
            </div>
          </div>
          <div className="user-card">
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.picture} alt="" className="user-avatar" referrerPolicy="no-referrer" />
            ) : (
              <span className="user-avatar user-avatar--initials">{initials}</span>
            )}
            <div className="user-card__copy">
              <strong>{displayName}</strong>
              <span>{user.email || "Authenticated staff"}</span>
            </div>
            <a className="logout-link" href="/login" aria-label="Exit demo workspace">
              ↗
            </a>
          </div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
