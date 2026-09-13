export function positionMenu(node: HTMLElement, point: { x: number; y: number }) {
  const pad = 8;
  function place() {
    const rect = node.getBoundingClientRect();
    let left = point.x;
    let top = point.y;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - rect.width - pad);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - rect.height - pad);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }
  place();
  return {
    update(np: { x: number; y: number }) {
      point = np;
      place();
    },
  };
}
