import React, { useMemo } from 'react';

// The stream overlays' background, behind the whole site: their night sky,
// with glints, dust and sparks scattered over it once, each on its own beat.
// Drawn by index.css (.league-sky).
export default function Sky() {
  const specks = useMemo(() => {
    const scatter = (kind, count, style) => Array.from({ length: count }, (_, i) => ({
      key: `${kind}${i}`,
      kind,
      style: { left: `${(Math.random() * 100).toFixed(2)}%`, top: `${(Math.random() * 100).toFixed(2)}%`, animationDelay: `${(Math.random() * 5).toFixed(2)}s`, ...style() },
    }));
    return [
      ...scatter('glint', 22, () => { const size = 26 * (0.5 + Math.random() * 1.1); return { width: size, height: size, margin: -size / 2, animationDuration: `${(2.2 + Math.random() * 2.6).toFixed(2)}s` }; }),
      ...scatter('dust', 90, () => { const size = 1 + Math.random() * 2.2; return { width: size, height: size, animationDuration: `${(3 + Math.random() * 4).toFixed(2)}s` }; }),
      ...scatter('spark', 30, () => ({ animationDuration: `${(3 + Math.random() * 3).toFixed(2)}s` })),
    ];
  }, []);
  return (
    <div className="league-sky" aria-hidden="true">
      {specks.map(({ key, kind, style }) => <span key={key} className={`league-${kind}`} style={style}>{kind === 'glint' && <i />}</span>)}
    </div>
  );
}
