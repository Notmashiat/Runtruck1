// Status chip. The mock data still carries the original design system's tag
// classes; map them onto the shell's chip colours.
const CHIP: Record<string, string> = {
  'tag-accent': 'ui-chip-info',
  'tag-neutral': 'ui-chip-gray',
  'tag-outline': 'ui-chip-amber',
  'tag-green': 'ui-chip-green',
};

export function Tag({ label, tagClass }: { label: string; tagClass: string }) {
  return <span className={`ui-chip ${CHIP[tagClass] ?? 'ui-chip-gray'}`}>{label}</span>;
}
