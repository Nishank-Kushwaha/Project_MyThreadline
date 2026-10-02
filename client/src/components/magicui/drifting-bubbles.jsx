// src/components/magicui/drifting-bubbles.jsx
import React from "react";

const BUBBLES = [
  { left: "8%", size: 42, delay: "0s", duration: "14s" },
  { left: "22%", size: 26, delay: "2.5s", duration: "11s" },
  { left: "38%", size: 54, delay: "1s", duration: "16s" },
  { left: "55%", size: 30, delay: "4s", duration: "12s" },
  { left: "68%", size: 46, delay: "0.5s", duration: "15s" },
  { left: "82%", size: 22, delay: "3s", duration: "10s" },
  { left: "92%", size: 38, delay: "5.5s", duration: "13s" },
];

export function DriftingBubbles({ className = "" }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-2xl bg-primary/20 backdrop-blur-sm animate-drift"
          style={{
            left: b.left,
            width: b.size,
            height: b.size * 0.7,
            animationDelay: b.delay,
            animationDuration: b.duration,
          }}
        />
      ))}
    </div>
  );
}
