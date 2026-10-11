"use client";

import * as React from "react";
import { SidebarLeft, ArrowDown2, CloseCircle, More, Add } from "iconsax-react";
import type { Icon as IconsaxIcon } from "iconsax-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * SIASTRA Design System — Composable & Themeable Sidebar
 * Conforms to the Radix / Shadcn composable sidebar specification.
 * ----------------------------------------------------------------------- */

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3.75rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

/* ---------------------------------- Context -------------------------------- */

export interface SidebarContextProps {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean | ((value: boolean) => boolean)) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar harus digunakan di dalam <SidebarProvider>.");
  }
  return context;
}

/* ------------------------------ SidebarProvider ---------------------------- */

export interface SidebarProviderProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const SidebarProvider = React.forwardRef<HTMLDivElement, SidebarProviderProps>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const [isMobile, setIsMobile] = React.useState(false);
    const [openMobile, setOpenMobile] = React.useState(false);
    const [_open, _setOpen] = React.useState(defaultOpen);

    // Controlled or uncontrolled open state
    const open = openProp !== undefined ? openProp : _open;
    const setOpen = React.useCallback(
      (value: boolean | ((val: boolean) => boolean)) => {
        const next = typeof value === "function" ? value(open) : value;
        if (onOpenChange) {
          onOpenChange(next);
        } else {
          _setOpen(next);
        }
      },
      [open, onOpenChange]
    );

    // Responsive window listener
    React.useEffect(() => {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768);
      };
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Toggle helper
    const toggleSidebar = React.useCallback(() => {
      if (isMobile) {
        setOpenMobile((prev) => !prev);
      } else {
        setOpen((prev) => !prev);
      }
    }, [isMobile, setOpen]);

    // Keyboard shortcut (cmd+b / ctrl+b)
    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (
          event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault();
          toggleSidebar();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleSidebar]);

    const state = open ? "expanded" : "collapsed";

    const contextValue = React.useMemo<SidebarContextProps>(
      () => ({
        state,
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }),
      [state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar]
    );

    const hasCustomHeight = className?.includes("h-") || className?.includes("min-h-");

    return (
      <SidebarContext.Provider value={contextValue}>
        <div
          ref={ref}
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper flex w-full text-foreground has-[[data-variant=inset]]:bg-muted/30",
            !hasCustomHeight && "min-h-screen",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = "SidebarProvider";

/* --------------------------------- Sidebar --------------------------------- */

export interface SidebarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  dir?: "ltr" | "rtl";
  // Backward compatibility props for simple declarative mode
  brand?: { name: string; subtitle?: string; logo?: React.ReactNode };
  groups?: SidebarGroupDef[];
  activeId?: string;
  onSelect?: (id: string) => void;
  user?: { name: string; role: string };
  defaultCollapsed?: boolean;
}

export const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "icon",
      dir = "ltr",
      className,
      children,
      // Declarative backward-compatibility
      brand,
      groups,
      activeId,
      onSelect,
      user,
      ...props
    },
    ref
  ) => {
    // If used outside of a SidebarProvider, safely provide a self-contained fallback
    const sidebarContext = React.useContext(SidebarContext);

    // If no context exists, we wrap it in a local provider state
    if (!sidebarContext) {
      return (
        <SidebarProvider defaultOpen={!props.defaultCollapsed}>
          <Sidebar
            side={side}
            variant={variant}
            collapsible={collapsible}
            dir={dir}
            className={className}
            brand={brand}
            groups={groups}
            activeId={activeId}
            onSelect={onSelect}
            user={user}
            {...props}
          >
            {children}
          </Sidebar>
        </SidebarProvider>
      );
    }

    const { state, openMobile, setOpenMobile, isMobile } = sidebarContext;

    // Mobile Sheet Drawer view
    if (isMobile) {
      return (
        <>
          {openMobile && (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs animate-fade-in"
              onClick={() => setOpenMobile(false)}
              aria-hidden="true"
            />
          )}
          <aside
            ref={ref}
            dir={dir}
            data-sidebar="sidebar"
            data-mobile="true"
            inert={!openMobile}
            aria-label="Navigasi utama"
            data-state={openMobile ? "open" : "closed"}
            className={cn(
              "fixed inset-y-0 z-50 flex h-full min-h-0 w-[var(--sidebar-width-mobile,18rem)] max-w-[85vw] flex-col overflow-hidden bg-surface border-r border-border shadow-2xl transition-transform duration-300 ease-in-out",
              side === "left"
                ? openMobile
                  ? "translate-x-0 left-0"
                  : "-translate-x-full left-0"
                : openMobile
                ? "translate-x-0 right-0"
                : "translate-x-full right-0",
              className
            )}
            {...props}
          >
            <div className="absolute right-3 top-3 z-10 sm:hidden">
              <button
                type="button"
                onClick={() => setOpenMobile(false)}
                className="p-1 rounded-md text-slate-400 hover:text-foreground"
                aria-label="Tutup Menu"
              >
                <CloseCircle size={20} />
              </button>
            </div>
            {/* If children provided, render children, otherwise render declarative fallback */}
            {children ? (
              children
            ) : groups ? (
              <DeclarativeSidebarContent
                brand={brand}
                groups={groups}
                activeId={activeId}
                onSelect={onSelect}
                user={user}
                collapsed={false}
              />
            ) : null}
          </aside>
        </>
      );
    }

    // Desktop Sidebar View
    const isIconCollapsible = collapsible === "icon" && state === "collapsed";
    const isOffcanvasCollapsible = collapsible === "offcanvas" && state === "collapsed";
    const isFixed = !className?.includes("static") && !className?.includes("relative") && !className?.includes("h-full");

    return (
      <div
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-state={state}
        className={cn(
          "group/sidebar relative transition-[width] duration-300 ease-in-out shrink-0",
          isFixed ? "h-screen" : "h-full min-h-0",
          isIconCollapsible
            ? "w-[var(--sidebar-width-icon,3.75rem)]"
            : isOffcanvasCollapsible
            ? "w-0 overflow-hidden"
            : "w-[var(--sidebar-width,16rem)]"
        )}
      >
        <aside
          ref={ref}
          dir={dir}
          data-side={side}
          data-variant={variant}
          data-collapsible={state === "collapsed" ? collapsible : ""}
          data-state={state}
          className={cn(
            "group/sidebar flex h-full min-h-0 flex-col overflow-hidden border-border bg-surface transition-[width,left,right,transform] duration-300 ease-in-out",
            isFixed ? "fixed inset-y-0 z-20" : "relative h-full z-10",
            side === "left" ? "left-0 border-r" : "right-0 border-l",
            isIconCollapsible
              ? "w-[var(--sidebar-width-icon,3.75rem)] overflow-x-hidden"
              : isOffcanvasCollapsible
              ? "w-[var(--sidebar-width,16rem)] -translate-x-full"
              : "w-[var(--sidebar-width,16rem)]",
            variant === "floating" &&
              "m-3 h-[calc(100vh-1.5rem)] rounded-2xl border shadow-lg",
            variant === "inset" && "m-0 border-r",
            className
          )}
          {...props}
        >
          {children ? (
            children
          ) : groups ? (
            <DeclarativeSidebarContent
              brand={brand}
              groups={groups}
              activeId={activeId}
              onSelect={onSelect}
              user={user}
              collapsed={isIconCollapsible}
            />
          ) : null}
        </aside>
      </div>
    );
  }
);
Sidebar.displayName = "Sidebar";

/* ------------------------------- SidebarHeader ----------------------------- */

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-3.5 border-b border-border/80 shrink-0", className)}
      {...props}
    />
  )
);
SidebarHeader.displayName = "SidebarHeader";

/* ------------------------------- SidebarFooter ----------------------------- */

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn("mt-auto flex flex-col gap-2 p-3 border-t border-border/80 shrink-0 bg-surface", className)}
      {...props}
    />
  )
);
SidebarFooter.displayName = "SidebarFooter";

/* ------------------------------ SidebarContent ----------------------------- */

export const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        "scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain p-2.5",
        className
      )}
      {...props}
    />
  )
);
SidebarContent.displayName = "SidebarContent";

/* -------------------------------- SidebarGroup ----------------------------- */

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col py-1", className)}
      {...props}
    />
  )
);
SidebarGroup.displayName = "SidebarGroup";

/* ----------------------------- SidebarGroupLabel --------------------------- */

export interface SidebarGroupLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, SidebarGroupLabelProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="group-label"
      className={cn(
        "flex h-7 shrink-0 items-center px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 group-data-[collapsible=icon]/sidebar:hidden",
        className
      )}
      {...props}
    />
  )
);
SidebarGroupLabel.displayName = "SidebarGroupLabel";

/* ---------------------------- SidebarGroupAction --------------------------- */

export const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    data-sidebar="group-action"
    className={cn(
      "absolute right-2 top-1.5 flex size-5 items-center justify-center rounded-md text-slate-400 hover:bg-muted hover:text-foreground transition-colors group-data-[collapsible=icon]/sidebar:hidden",
      className
    )}
    {...props}
  />
));
SidebarGroupAction.displayName = "SidebarGroupAction";

/* --------------------------- SidebarGroupContent --------------------------- */

export const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="group-content"
      className={cn("w-full text-xs space-y-0.5", className)}
      {...props}
    />
  )
);
SidebarGroupContent.displayName = "SidebarGroupContent";

/* -------------------------------- SidebarMenu ------------------------------ */

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1 list-none p-0 m-0", className)}
      {...props}
    />
  )
);
SidebarMenu.displayName = "SidebarMenu";

/* ------------------------------ SidebarMenuItem ---------------------------- */

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      data-sidebar="menu-item"
      className={cn(
        "group/menu-item relative list-none w-full group-data-[collapsible=icon]/sidebar:flex group-data-[collapsible=icon]/sidebar:justify-center",
        className
      )}
      {...props}
    />
  )
);
SidebarMenuItem.displayName = "SidebarMenuItem";

/* ----------------------------- SidebarMenuButton --------------------------- */

export interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  isActive?: boolean;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  tooltip?: string;
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  (
    {
      asChild = false,
      isActive = false,
      variant = "default",
      size = "default",
      tooltip,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "h-8 px-2 text-xs",
      default: "h-9 px-2.5 text-xs sm:text-sm",
      lg: "h-11 px-3 text-sm",
    }[size];

    const content = (
      <>
        {children}
        {/* Floating Tooltip in collapsed icon mode */}
        {tooltip && (
          <span
            data-sidebar="tooltip"
            className="pointer-events-none absolute left-full z-50 ml-3 hidden group-data-[collapsible=icon]/sidebar:group-hover/menu-item:flex items-center rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-xl transition-all duration-150 animate-fade-in"
          >
            {tooltip}
          </span>
        )}
      </>
    );

    const buttonClass = cn(
      "focus-ring peer/menu-button relative flex w-full items-center gap-2.5 rounded-md font-medium transition-all duration-200 cursor-pointer select-none",
      sizeClasses,
      isActive
        ? "bg-primary-soft text-primary font-bold shadow-xs rounded-md"
        : "text-slate-600 hover:bg-muted/80 hover:text-foreground",
      variant === "outline" && "border border-border bg-surface hover:bg-muted",
      "group-data-[collapsible=icon]/sidebar:size-10 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:p-0 group-data-[collapsible=icon]/sidebar:mx-auto group-data-[collapsible=icon]/sidebar:rounded-md",
      className
    );

    // Active indicator accent bar
    const indicator = isActive && (
      <span className="sidebar-active-bar absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-xs bg-primary group-data-[collapsible=icon]/sidebar:hidden" />
    );

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, {
        className: cn(buttonClass, (children.props as any)?.className),
        ref,
        ...props,
      });
    }

    return (
      <button ref={ref} data-active={isActive} className={buttonClass} {...props}>
        {indicator}
        {content}
      </button>
    );
  }
);
SidebarMenuButton.displayName = "SidebarMenuButton";

/* ----------------------------- SidebarMenuAction --------------------------- */

export interface SidebarMenuActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  showOnHover?: boolean;
}

export const SidebarMenuAction = React.forwardRef<HTMLButtonElement, SidebarMenuActionProps>(
  ({ showOnHover = false, className, ...props }, ref) => (
    <button
      ref={ref}
      data-sidebar="menu-action"
      className={cn(
        "absolute right-2 top-1/2 -translate-y-1/2 flex aspect-square size-6 items-center justify-center rounded-lg text-slate-400 hover:bg-muted hover:text-foreground transition-all group-data-[collapsible=icon]/sidebar:hidden",
        showOnHover && "opacity-0 group-hover/menu-item:opacity-100",
        className
      )}
      {...props}
    />
  )
);
SidebarMenuAction.displayName = "SidebarMenuAction";

/* ------------------------------ SidebarMenuBadge --------------------------- */

export const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="menu-badge"
      className={cn(
        "ml-auto flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-primary text-white shrink-0 group-data-[collapsible=icon]/sidebar:hidden",
        className
      )}
      {...props}
    />
  )
);
SidebarMenuBadge.displayName = "SidebarMenuBadge";

/* ---------------------------- SidebarMenuSkeleton -------------------------- */

export const SidebarMenuSkeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 animate-pulse bg-muted/60",
        className
      )}
      {...props}
    >
      <div className="size-5 rounded-lg bg-slate-300/60 shrink-0" />
      <div className="h-3 w-24 rounded bg-slate-300/60 group-data-[collapsible=icon]/sidebar:hidden" />
    </div>
  )
);
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton";

/* ------------------------------ SidebarMenuSub ----------------------------- */

export const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 my-1 flex min-w-0 flex-col gap-1 border-l-2 border-border/80 pl-3 group-data-[collapsible=icon]/sidebar:hidden",
        className
      )}
      {...props}
    />
  )
);
SidebarMenuSub.displayName = "SidebarMenuSub";

/* ---------------------------- SidebarMenuSubItem --------------------------- */

export const SidebarMenuSubItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => <li ref={ref} className={cn("list-none", className)} {...props} />
);
SidebarMenuSubItem.displayName = "SidebarMenuSubItem";

/* --------------------------- SidebarMenuSubButton -------------------------- */

export interface SidebarMenuSubButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean;
  isActive?: boolean;
}

export const SidebarMenuSubButton = React.forwardRef<HTMLAnchorElement, SidebarMenuSubButtonProps>(
  ({ isActive = false, className, children, ...props }, ref) => (
    <a
      ref={ref}
      className={cn(
        "flex h-7 items-center rounded-lg px-2 text-xs font-medium transition-colors hover:bg-muted hover:text-foreground",
        isActive ? "font-bold text-primary bg-primary-soft/50" : "text-slate-500",
        className
      )}
      {...props}
    >
      {children}
    </a>
  )
);
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

/* ------------------------------- SidebarTrigger ---------------------------- */

export const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar, state } = useSidebar();

  return (
    <button
      ref={ref}
      data-sidebar="trigger"
      aria-label="Toggle Sidebar"
      onClick={(e) => {
        onClick?.(e);
        toggleSidebar();
      }}
      className={cn(
        "focus-ring inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-slate-600 hover:bg-muted hover:text-foreground shadow-2xs transition-all cursor-pointer active:scale-95",
        className
      )}
      {...props}
    >
      <SidebarLeft
        size={18}
        variant="Linear"
        className={cn(
          "transition-transform duration-300 rtl:rotate-180",
          state === "collapsed" && "rotate-180"
        )}
      />
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
});
SidebarTrigger.displayName = "SidebarTrigger";

/* -------------------------------- SidebarRail ------------------------------ */

export const SidebarRail = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();

    return (
      <button
        ref={ref}
        data-sidebar="rail"
        aria-label="Toggle Sidebar Rail"
        tabIndex={-1}
        onClick={toggleSidebar}
        title="Toggle Sidebar"
        className={cn(
          "absolute inset-y-0 z-30 hidden w-3 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-primary/50 group-data-[side=left]/sidebar:-right-3 group-data-[side=right]/sidebar:left-0 sm:flex cursor-ew-resize",
          className
        )}
        {...props}
      />
    );
  }
);
SidebarRail.displayName = "SidebarRail";

/* -------------------------------- SidebarInset ----------------------------- */

export const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="inset"
      className={cn(
        "relative flex min-h-screen flex-1 flex-col bg-background transition-all duration-300 ease-in-out",
        className
      )}
      {...props}
    />
  )
);
SidebarInset.displayName = "SidebarInset";

/* -------------------------------------------------------------------------
 * Declarative Helper for Backward-Compatibility
 * ----------------------------------------------------------------------- */

export interface SidebarItemDef {
  id: string;
  label: string;
  icon: IconsaxIcon;
  badge?: string | number;
  href?: string;
}

export interface SidebarGroupDef {
  label: string;
  items: SidebarItemDef[];
}

function DeclarativeSidebarContent({
  brand,
  groups,
  activeId,
  onSelect,
  user,
  collapsed,
}: {
  brand?: { name: string; subtitle?: string; logo?: React.ReactNode };
  groups: SidebarGroupDef[];
  activeId?: string;
  onSelect?: (id: string) => void;
  user?: { name: string; role: string };
  collapsed: boolean;
}) {
  const [active, setActive] = React.useState(activeId ?? groups[0]?.items[0]?.id);
  const { toggleSidebar } = useSidebar();

  return (
    <>
      {brand && (
        <SidebarHeader>
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-primary-hover text-white font-black text-sm shadow-md shadow-primary/20">
              {brand.logo ?? brand.name[0]}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-foreground leading-tight">{brand.name}</p>
                {brand.subtitle && (
                  <p className="truncate text-[11px] font-semibold text-muted-foreground">{brand.subtitle}</p>
                )}
              </div>
            )}
            <button
              onClick={toggleSidebar}
              className={cn("p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted ml-auto", collapsed && "hidden")}
              title="Ciutkan Sidebar"
            >
              <SidebarLeft size={18} />
            </button>
          </div>
        </SidebarHeader>
      )}

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ id, label, icon: Icon, badge, href }) => {
                  const isActive = active === id;
                  return (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={label}
                        onClick={() => {
                          setActive(id);
                          onSelect?.(id);
                        }}
                      >
                        <Icon size={18} variant={isActive ? "Bold" : "Linear"} className="shrink-0" />
                        <span className="truncate group-data-[collapsible=icon]/sidebar:hidden">{label}</span>
                        {badge !== undefined && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {user && (
        <SidebarFooter>
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-warning font-bold text-xs text-white shadow-xs">
              {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground">{user.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{user.role}</p>
              </div>
            )}
          </div>
        </SidebarFooter>
      )}
    </>
  );
}
