export interface KeyboardActions {
  moveFocus(dx: number, dy: number): void;
  undo(): void;
  restart(): void;
  isDialogOpen(): boolean;
}

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** Pfeile bewegen den Fokus ueber die Fahrzeuge, U = Undo, R = Neustart. Enter/Space tippen nativ per Button. */
export function bindKeyboard(actions: KeyboardActions): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const arrow = ARROWS[e.key];
    if (arrow) {
      if (actions.isDialogOpen()) return;
      e.preventDefault();
      actions.moveFocus(arrow[0], arrow[1]);
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'u') {
      e.preventDefault();
      actions.undo();
    } else if (key === 'r') {
      e.preventDefault();
      actions.restart();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
