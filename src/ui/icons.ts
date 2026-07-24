/** Chunk Win98-style glyphs for bevel buttons. */

function svg(paths: string, viewBox = '0 0 16 16'): SVGSVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  node.setAttribute('class', 'icon')
  node.setAttribute('viewBox', viewBox)
  node.setAttribute('aria-hidden', 'true')
  node.setAttribute('focusable', 'false')
  node.innerHTML = paths
  return node
}

export const icons = {
  play: () =>
    svg('<polygon points="4,2 14,8 4,14" fill="currentColor"/>'),
  pause: () =>
    svg(
      '<rect x="3" y="2" width="3.5" height="12" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor"/>',
    ),
  reset: () =>
    svg(
      '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/><polygon points="14,2 14,7.5 8.5,7.5" fill="currentColor"/>',
    ),
  save: () =>
    svg(
      '<path d="M2 2h10l2 2v10H2V2z" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4.5" y="2.5" width="5" height="4" fill="currentColor"/><rect x="4" y="9" width="8" height="4.5" fill="currentColor"/>',
    ),
  load: () =>
    svg(
      '<path d="M2 5h4l1.5-1.5H14v9.5H2V5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7v5M5.5 9.5L8 12l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/>',
    ),
  export: () =>
    svg(
      '<rect x="3" y="2" width="8" height="11" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 2v3h3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 9h8M11.5 6.5L14 9l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/>',
    ),
  setup: () =>
    svg(
      '<rect x="2" y="3" width="12" height="2.2" fill="currentColor"/><rect x="2" y="7" width="12" height="2.2" fill="currentColor"/><rect x="2" y="11" width="12" height="2.2" fill="currentColor"/><circle cx="5" cy="4.1" r="1.6" fill="var(--panel, #fff8e7)" stroke="currentColor" stroke-width="1.2"/><circle cx="11" cy="8.1" r="1.6" fill="var(--panel, #fff8e7)" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="12.1" r="1.6" fill="var(--panel, #fff8e7)" stroke="currentColor" stroke-width="1.2"/>',
    ),
  maximize: () =>
    svg('<rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
  restore: () =>
    svg(
      '<rect x="5" y="2" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="5" width="9" height="9" fill="var(--panel, #fff8e7)" stroke="currentColor" stroke-width="1.5"/>',
    ),
  sheet: () =>
    svg(
      '<rect x="3" y="1.5" width="10" height="13" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 5h6M5 7.5h6M5 10h4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square"/>',
    ),
}

export type IconName = keyof typeof icons

export function iconBtn(
  className: string,
  icon: IconName,
  label: string,
  opts: { primary?: boolean; title?: string } = {},
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `bevel icon-btn${opts.primary ? ' primary' : ''} ${className}`.trim()
  btn.title = opts.title ?? label
  btn.setAttribute('aria-label', label)
  btn.append(icons[icon](), document.createTextNode(label))
  return btn
}
