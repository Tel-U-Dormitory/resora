"use client";

import React, { useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { useAuth, MOCK_PROFILES } from "@/config/auth-context";
import { ShieldSecurity, ArrowDown2 } from "iconsax-react";

export function DashboardHeader() {
  const { user, permissions, currentRoleKey, switchRole } = useAuth();
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-surface/85 px-3 sm:px-6 backdrop-blur-md">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <SidebarTrigger className="-ml-1 text-foreground hover:text-primary transition-colors cursor-pointer shrink-0" />
        <div className="h-4 w-px bg-border shrink-0" />
        <div className="flex items-center gap-2 text-xs truncate">
          <span className="font-extrabold text-foreground tracking-tight shrink-0">RESORA</span>
          <span className="text-muted-foreground hidden sm:inline">/</span>
          <span className="font-medium text-muted-foreground hidden sm:inline truncate max-w-[200px] md:max-w-none">
            Presensi Digital SR (NEED-001)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Role Simulator Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-1 sm:px-3 text-[11px] sm:text-xs font-bold text-primary-soft-foreground hover:bg-[#fddcd9] transition-all cursor-pointer shadow-xs whitespace-nowrap shrink-0"
          >
            <ShieldSecurity size={14} variant="Bold" className="text-primary shrink-0" />
            <span className="hidden sm:inline">Role: </span>
            <span>{user.departmentCode} ({user.positionCode})</span>
            <ArrowDown2 size={11} className={showRoleMenu ? "rotate-180 transition-transform shrink-0" : "transition-transform shrink-0"} />
          </button>

          {showRoleMenu && (
            <div className="fixed sm:absolute top-16 sm:top-full right-3 sm:right-0 sm:mt-2 w-[calc(100vw-1.5rem)] sm:w-72 max-w-xs rounded-2xl border border-border bg-surface p-2.5 shadow-xl z-50 animate-scale-in">
              <div className="px-2.5 py-1.5 text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                Simulasi Role Pengguna (Dev Mode)
              </div>
              <div className="space-y-1 mt-1">
                {Object.entries(MOCK_PROFILES).map(([key, profile]) => (
                  <button
                    key={key}
                    onClick={() => {
                      switchRole(key);
                      setShowRoleMenu(false);
                    }}
                    className={`w-full flex flex-col items-start px-3 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                      currentRoleKey === key
                        ? "bg-primary text-white font-bold shadow-xs"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span>{profile.name}</span>
                    <span
                      className={`text-[10px] ${
                        currentRoleKey === key
                          ? "text-white/80 font-normal"
                          : "text-muted-foreground font-normal"
                      }`}
                    >
                      {profile.departmentCode} • {profile.positionName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <ModeToggle />
      </div>
    </header>
  );
}
