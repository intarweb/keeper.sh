import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import MenuIcon from "lucide-react/dist/esm/icons/menu";
import XIcon from "lucide-react/dist/esm/icons/x";
import { tv } from "tailwind-variants/lite";
import { LayoutRow } from "@/components/ui/shells/layout";
import { Button } from "@/components/ui/primitives/button";
import { StaggeredBackdropBlur } from "@/components/ui/primitives/staggered-backdrop-blur";
import {
  NavigationMenu,
  NavigationMenuItemLabel,
  NavigationMenuItemTrailing,
  NavigationMenuLinkItem,
} from "@/components/ui/composites/navigation-menu/navigation-menu-items";

const MENU_ID = "marketing-header-menu";

type MarketingNavItem = {
  to: ComponentPropsWithoutRef<typeof Link>["to"];
  label: string;
};

const NAV_ITEMS: MarketingNavItem[] = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/blog", label: "Blog" },
];

const navItem = tv({
  base: "px-2 py-1 rounded-lg text-sm tracking-tight font-light text-foreground-muted hover:text-foreground-hover aria-[current=page]:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
});

export function MarketingHeader({ children }: PropsWithChildren) {
  return (
    <div className="w-full sticky top-0 z-50">
      <StaggeredBackdropBlur />
      <LayoutRow className="relative z-10">
        <header className="flex justify-between items-center gap-2 py-3">
          {children}
        </header>
      </LayoutRow>
    </div>
  );
}

export function MarketingHeaderBranding({ children, label }: PropsWithChildren<{ label?: string }>) {
  return <Link to="/" className="flex items-center text-foreground hover:text-foreground-hover" aria-label={label}>{children}</Link>;
}

export function MarketingHeaderNav() {
  return (
    <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
      {NAV_ITEMS.map(({ to, label }) => (
        <Link key={label} to={to} className={navItem()}>{label}</Link>
      ))}
    </nav>
  );
}

export function MarketingHeaderMenu() {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setExpanded(false), []);
  const toggle = useCallback(() => setExpanded((value) => !value), []);

  useEffect(() => {
    if (!expanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current
        && event.target instanceof Node
        && !containerRef.current.contains(event.target)
      ) {
        close();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [expanded, close]);

  return (
    <div ref={containerRef} className="relative md:hidden">
      <Button
        type="button"
        size="compact"
        variant="ghost"
        aria-controls={MENU_ID}
        aria-expanded={expanded}
        aria-label={expanded ? "Close navigation menu" : "Open navigation menu"}
        onClick={toggle}
      >
        {expanded ? <XIcon size={16} aria-hidden="true" /> : <MenuIcon size={16} aria-hidden="true" />}
      </Button>
      {expanded && (
        <nav
          id={MENU_ID}
          aria-label="Primary"
          className="absolute right-0 top-full mt-2 w-44 z-20"
          onClick={close}
        >
          <NavigationMenu>
            {NAV_ITEMS.map(({ to, label }) => (
              <NavigationMenuLinkItem key={label} to={to}>
                <NavigationMenuItemLabel>{label}</NavigationMenuItemLabel>
                <NavigationMenuItemTrailing />
              </NavigationMenuLinkItem>
            ))}
          </NavigationMenu>
        </nav>
      )}
    </div>
  );
}

export function MarketingHeaderActions({ children }: PropsWithChildren) {
  return (
    <div className="flex items-center gap-2">
      {children}
    </div>
  );
}
