import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { cn } from "@/lib/utils";

// Subcomponent: Staggered animated bubbling / bouncing dots
function BubblingDots({ className }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span
        className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
        style={{ animationDuration: "0.9s", animationDelay: "-0.3s" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
        style={{ animationDuration: "0.9s", animationDelay: "-0.15s" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
        style={{ animationDuration: "0.9s", animationDelay: "0s" }}
      />
    </span>
  );
}

// Subcomponent: WhatsApp Web-style startup loading screen with progress percentage and logo
function WhatsAppLoadingScreen({ isLoading, onComplete }) {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  // Progressive percentage increment
  useEffect(() => {
    let timer = null;

    const tick = () => {
      setProgress((prev) => {
        // While session check is in flight, advance smoothly up to ~90%
        if (isLoading) {
          if (prev < 30) return prev + Math.random() * 6 + 4;
          if (prev < 65) return prev + Math.random() * 3 + 2;
          if (prev < 88) return prev + Math.random() * 1.5 + 0.5;
          if (prev < 94) return Math.min(94, prev + 0.2);
          return prev;
        }

        // When authentication resolves, rapidly complete to 100%
        if (prev < 100) {
          const step = Math.max(3, (100 - prev) * 0.45);
          const next = prev + step;
          return next >= 99.5 ? 100 : next;
        }

        return 100;
      });
    };

    timer = setInterval(tick, 40);
    return () => clearInterval(timer);
  }, [isLoading]);

  // Handle completion, hold at 100%, and trigger fade-out exit
  useEffect(() => {
    if (progress < 100) return;

    const holdTimer = setTimeout(() => {
      setIsExiting(true);
    }, 200);

    const exitTimer = setTimeout(() => {
      onComplete?.();
    }, 520);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
    };
  }, [progress, onComplete]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading application"
      className={cn(
        "fixed inset-0 z-100 flex flex-col items-center justify-center bg-background px-4 select-none",
        "transition-opacity duration-300 ease-out",
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100",
      )}
    >
      <div className="flex flex-col items-center gap-8 -translate-y-4">
        {/* App Logo with ambient glow */}
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute -inset-4 rounded-3xl bg-primary/20 blur-2xl animate-pulse"
          />
          <img
            src="/logo.svg"
            alt="Threadline"
            className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-3xl shadow-2xl drop-shadow-lg"
          />
        </div>

        {/* Horizontal progress track and percentage label */}
        <div className="w-64 sm:w-80 space-y-2.5">
          <div className="relative h-1 sm:h-1.5 w-full overflow-hidden rounded-full bg-muted/60 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-linear-to-r from-[#2ee6c5] to-[#4aa8ff] transition-all duration-100 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span className="tracking-tight">Loading Threadline…</span>
            <span className="font-mono tabular-nums text-foreground/80">
              {Math.min(100, Math.floor(progress))}%
            </span>
          </div>
        </div>
      </div>

      {/* Footer encryption badge matching WhatsApp Web branding */}
      <div className="absolute bottom-8 flex flex-col items-center gap-1.5 text-center">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 text-emerald-400" />
          <span>End-to-end encrypted</span>
        </div>
        <p className="text-[10px] font-semibold text-muted-foreground/60 tracking-widest uppercase">
          Threadline
        </p>
      </div>
    </div>
  );
}

// Route protector displaying startup animation on initial load and guarding private views
export function ProtectedRoute({ children }) {
  // Context hooks
  const { user, isLoading } = useAuth();

  // Remember splash display in current tab session
  const [hasCompletedSplash, setHasCompletedSplash] = useState(() => {
    try {
      return sessionStorage.getItem("threadline_splash_shown") === "true";
    } catch {
      return false;
    }
  });

  const handleSplashComplete = () => {
    try {
      sessionStorage.setItem("threadline_splash_shown", "true");
    } catch {
      // sessionStorage disabled or restricted
    }
    setHasCompletedSplash(true);
  };

  // Initial startup: show WhatsApp loading screen until initial check & animation complete
  if (!hasCompletedSplash) {
    return (
      <>
        <WhatsAppLoadingScreen
          isLoading={isLoading}
          onComplete={handleSplashComplete}
        />
        {user ? children : null}
      </>
    );
  }

  // Subsequent background checks if session re-authenticates
  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-sm select-none">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="font-medium text-foreground/80">Loading</span>
          <BubblingDots className="translate-y-0.5 text-primary" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
