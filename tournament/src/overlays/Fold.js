import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// A section of the Prepare tab that can be closed down to its title, so the
// ones not being worked on stay out of the way. Open or closed is remembered
// per section in this browser. `action` is a button that stays in the header.
export default function Fold({ id, title, action = null, className = '', children }) {
  const key = `prepare-section:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(key) !== 'closed';
    } catch (err) {
      return true;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      window.localStorage.setItem(key, open ? 'closed' : 'open');
    } catch (err) {
      // Not remembered; it lasts until the page is loaded again.
    }
  };
  return (
    <section className={`bg-gray-800 rounded-lg border border-gray-700 p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={toggle} aria-expanded={open} aria-label={`${open ? 'Close' : 'Open'} ${title}`} className="flex items-center gap-2 text-left min-w-0 hover:text-gray-300">
          <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          <h2 className="text-xl font-bold">{title}</h2>
        </button>
        {open && action}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}
