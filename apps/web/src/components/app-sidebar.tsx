"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Category,
  Calendar,
  AddCircle,
  ScanBarcode,
  Logout,
  ShieldSecurity,
  User,
} from "iconsax-react";
import { MAIN_NAVIGATION } from "@/config/navigation";
import { useAuth } from "@/config/auth-context";

// Helper to map icon name string to icon component
function getNavIcon(name: string, active: boolean) {
  const variant = active ? "Bold" : "Linear";
  switch (name) {
    case "Category":
      return <Category size={18} variant={variant} />;
    case "Calendar":
      return <Calendar size={18} variant={variant} />;
    case "AddCircle":
      return <AddCircle size={18} variant={variant} />;
    case "ScanBarcode":
      return <ScanBarcode size={18} variant={variant} />;
    default:
      return <Category size={18} variant={variant} />;
  }
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user, permissions, logout } = useAuth();

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Sidebar Header — RESORA Brand */}
      <SidebarHeader>
        <div className="flex items-center gap-3 p-2 group-data-[collapsible=icon]/sidebar:justify-center">
          <div className="sidebar-brand-icon flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-primary-hover text-white font-black text-sm shadow-md shadow-primary/25">
            R
          </div>
          <div className="flex flex-col truncate group-data-[collapsible=icon]/sidebar:hidden">
            <span className="truncate text-sm font-extrabold text-foreground tracking-tight flex items-center gap-1.5">
              RESORA
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                SR XIV
              </span>
            </span>
            <span className="truncate text-[10px] font-medium text-muted-foreground">
              Dormitory Management System
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* Sidebar Content — Dynamic Navigation based on Role */}
      <SidebarContent>
        {MAIN_NAVIGATION.map((group) => {
          const visibleItems = group.items.filter((item) => item.isVisible(permissions));
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.groupLabel}>
              <SidebarGroupLabel>{group.groupLabel}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const isActive =
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href);

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                        >
                          <Link href={item.href as any} className="flex items-center gap-3 w-full">
                            {getNavIcon(item.iconName, isActive)}
                            <span className="truncate group-data-[collapsible=icon]/sidebar:hidden flex-1">
                              {item.title}
                            </span>
                            {item.badge && (
                              <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {/* Sidebar Footer — User profile and logout */}
      <SidebarFooter>
        <div className="flex items-center gap-3 p-2 group-data-[collapsible=icon]/sidebar:justify-center border-t border-border">
          <div className="sidebar-user-avatar flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-amber-600 text-white font-bold text-xs shadow-xs">
            {user.name.charAt(0)}
          </div>
          <div className="flex flex-col truncate group-data-[collapsible=icon]/sidebar:hidden flex-1 min-w-0">
            <span className="truncate text-xs font-bold text-foreground">
              {user.name}
            </span>
            <span className="truncate text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="font-semibold text-primary">{user.departmentCode}</span> •{" "}
              {user.positionName}
            </span>
          </div>
          <button
            onClick={logout}
            title="Keluar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer group-data-[collapsible=icon]/sidebar:hidden"
          >
            <Logout size={16} />
          </button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
