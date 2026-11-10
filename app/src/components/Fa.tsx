import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';

// A Font Awesome icon as inline SVG, sized and coloured like text (1em, current
// colour). Icons: Font Awesome Free by Fonticons, Inc., https://fontawesome.com,
// licensed CC BY 4.0. Only the icons imported are bundled.
export function Fa({ icon, className = '', spin = false }: { icon: IconDefinition; className?: string; spin?: boolean }) {
  const [width, height, , , path] = icon.icon;
  return (
    <svg
      className={`fa-svg${spin ? ' fa-spin' : ''}${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      style={{ width: `${width / height}em` }}
    >
      {(Array.isArray(path) ? path : [path]).map((d, i) => <path key={i} d={d} fill="currentColor" />)}
    </svg>
  );
}
