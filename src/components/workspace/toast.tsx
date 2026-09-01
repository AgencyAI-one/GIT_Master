"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

export type ToastMessage = { id: number; message: string; type?: "success" | "error" };

export function Toasts({ items, dismiss }: { items: ToastMessage[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -12, scale: .97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 18 }}
            className="pointer-events-auto flex items-start gap-3 rounded-xl bg-[#171a1c] px-4 py-3 text-sm text-white shadow-2xl"
          >
            {item.type === "error" ? <CircleAlert size={17} className="mt-0.5 shrink-0 text-[#ff8585]" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#b9ec55]" />}
            <span className="min-w-0 flex-1 leading-5">{item.message}</span>
            <button type="button" onClick={() => dismiss(item.id)} aria-label="Закрити" className="text-white/50 hover:text-white"><X size={15} /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
