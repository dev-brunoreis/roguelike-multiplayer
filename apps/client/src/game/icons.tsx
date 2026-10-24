export function SkillGlyph({ id, color, title }: { id: string; color: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className="skill-glyph" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <rect width="24" height="24" fill="#1a1612" />
      {glyph(id, color)}
      <rect x="0.5" y="0.5" width="23" height="23" fill="none" stroke="#3a3228" />
    </svg>
  );
}

function glyph(id: string, color: string) {
  if (id === "golpe_rapido") {
    return <path fill={color} d="M11 3h3v14h-3zm-3 12h9v3H8zm2 3h5v3h-5z" />;
  }
  if (id === "raio_encadeado") {
    return <path fill={color} d="M14 2 7 13h5l-4 9 10-12h-6l2-8z" />;
  }
  if (id === "explosao") {
    return (
      <>
        <circle cx="12" cy="12" r="7" fill={color} />
        <path fill="#1a1612" d="M11 5h2v14h-2zM5 11h14v2H5z" />
      </>
    );
  }
  if (id === "flecha") {
    return <path fill={color} d="M4 9h2v6H4zm3 3h10v2H7zm10-4 5 4-5 4v-3h-2v-2h2z" />;
  }
  if (id === "sopro") {
    return <path fill={color} d="M5 12 20 4v16z" />;
  }
  if (id === "lamina") {
    return (
      <>
        <circle cx="12" cy="12" r="8" fill="none" stroke={color} strokeWidth="2" />
        <path fill={color} d="M11 4h2v16h-2zM4 11h16v2H4z" />
      </>
    );
  }
  return <rect x="7" y="7" width="10" height="10" fill={color} />;
}
