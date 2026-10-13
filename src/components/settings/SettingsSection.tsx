import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Bloc repliable des réglages : un en-tête cliquable, le contenu apparaît dessous. */
export const SettingsSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span className="text-xs font-bold text-slate-900 dark:text-white">{title}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </section>
  );
};
