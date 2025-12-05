import { ReactNode } from "react";

interface SlideLayoutProps {
  children: ReactNode;
  className?: string;
}

export default function SlideLayout({ children, className = "" }: SlideLayoutProps) {
  return (
    <div className={`h-full w-full flex flex-col items-center justify-center px-16 ${className}`}>
      {children}
    </div>
  );
}
