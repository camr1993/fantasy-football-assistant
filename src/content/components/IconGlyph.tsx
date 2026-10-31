import React from 'react';

export type GlyphKind = 'start' | 'bench' | 'waiver' | 'clear';

interface IconGlyphProps {
  kind: GlyphKind;
}

/**
 * The badge glyphs, drawn as SVG.
 *
 * These were emoji and text arrows, which render at different weights and
 * baselines across platforms and sat unevenly inside an 18px circle. Paths
 * give every state the same optical weight and alignment.
 */
export function IconGlyph({ kind }: IconGlyphProps) {
  const common = {
    width: 10,
    height: 10,
    viewBox: '0 0 12 12',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (kind === 'clear') {
    return (
      <svg {...common}>
        <path d="M2.5 6.5 L5 9 L9.5 3" />
      </svg>
    );
  }

  if (kind === 'start') {
    // Upward chevron over a baseline: "move this into your lineup"
    return (
      <svg {...common}>
        <path d="M6 9.5 V3" />
        <path d="M2.75 6 L6 2.75 L9.25 6" />
      </svg>
    );
  }

  if (kind === 'bench') {
    return (
      <svg {...common}>
        <path d="M6 2.5 V9" />
        <path d="M2.75 6 L6 9.25 L9.25 6" />
      </svg>
    );
  }

  // waiver: two arrows circling, for a swap
  return (
    <svg {...common}>
      <path d="M2 5 A4 4 0 0 1 10 4.4" />
      <path d="M10 7 A4 4 0 0 1 2 7.6" />
      <path d="M8.2 4.4 H10.4 V2.3" />
      <path d="M3.8 7.6 H1.6 V9.7" />
    </svg>
  );
}
