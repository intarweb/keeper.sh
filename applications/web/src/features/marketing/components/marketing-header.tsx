import type { PropsWithChildren } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutRow } from "@/components/ui/shells/layout";
import { StaggeredBackdropBlur } from "@/components/ui/primitives/staggered-backdrop-blur";
import { NAV_ITEMS } from "./nav-items";

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
    <nav aria-label="Main" className="hidden sm:flex items-center gap-5">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="text-sm tracking-tight font-light text-foreground-muted hover:text-foreground-hover"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function MarketingHeaderActions({ children }: PropsWithChildren) {
  return (
    <div className="flex items-center gap-2">
      {children}
    </div>
  );
}
