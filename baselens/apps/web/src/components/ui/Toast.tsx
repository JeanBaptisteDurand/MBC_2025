import { createContext, useContext, useState, type ReactNode } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { cn } from "../../utils/cn";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "error" | "info";
}

interface ToastContextValue {
  toast: (options: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = (options: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...options, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            open={true}
            onOpenChange={(open) => {
              if (!open) removeToast(t.id);
            }}
            duration={5000}
            className={cn(
              "group relative flex items-start gap-3 p-4 rounded-lg shadow-lg border",
              "data-[state=open]:animate-slide-in data-[state=closed]:animate-fade-out",
              "bg-surface-900/95 backdrop-blur-sm border-surface-700",
              t.variant === "success" && "border-emerald-700/50",
              t.variant === "error" && "border-red-700/50",
              t.variant === "info" && "border-primary-700/50"
            )}
          >
            <ToastIcon variant={t.variant} />
            
            <div className="flex-1 min-w-0">
              <ToastPrimitive.Title className="text-sm font-semibold text-surface-100">
                {t.title}
              </ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="text-sm text-surface-400 mt-1">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>

            <ToastPrimitive.Close className="p-1 rounded text-surface-500 hover:text-surface-100 hover:bg-surface-800 transition-colors">
              <X className="w-4 h-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}

        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 w-[380px] max-w-[calc(100vw-2rem)] z-50 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function ToastIcon({ variant }: { variant?: Toast["variant"] }) {
  switch (variant) {
    case "success":
      return <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />;
    case "error":
      return <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />;
    case "info":
      return <Info className="w-5 h-5 text-primary-400 flex-shrink-0" />;
    default:
      return null;
  }
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

