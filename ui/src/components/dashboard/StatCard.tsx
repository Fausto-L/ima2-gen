import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  children: ReactNode;
  wide?: boolean;
}

export function StatCard({ title, children, wide }: StatCardProps) {
  return (
    <div className={`dash-card${wide ? " dash-card--wide" : ""}`}>
      <div className="dash-card__header">
        <span className="dash-card__title">{title}</span>
      </div>
      {children}
    </div>
  );
}
