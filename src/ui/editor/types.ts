// Ansichtsmodell und Handler des Level-Editors (DOM-Seite). Der Screen in src/app baut das Modell.
import type { Dir } from '../../schema';

export type EditorTool = 'place' | 'select' | 'fixed' | 'arrow';

export interface EditorCellVm {
  x: number;
  y: number;
  /** `oneWay`: Abbiegepfeil in Richtung `dir`. */
  kind: 'empty' | 'fixed' | 'vehicle' | 'oneWay';
  color?: string;
  vehicleId?: string;
  head: boolean;
  dir?: Dir;
  selected: boolean;
  locked: boolean;
  /** Anderes Fahrzeug haengt von diesem als Schluessel ab. */
  isKey: boolean;
  /** Mystery-Fahrzeug (Farbe im Spiel verdeckt). */
  mystery?: boolean;
  label: string;
}

export interface StepperVm {
  value: number;
  min: number;
  max: number;
}

export type StatusTone = 'idle' | 'busy' | 'ok' | 'warn' | 'bad';

export interface EditorViewModel {
  width: number;
  height: number;
  /** Zeilenweise (y, dann x). */
  cells: EditorCellVm[];
  tool: EditorTool;
  /** Angebotene Werkzeuge (Pfeil nur mit erlaubten oder vorhandenen Pfeilen). */
  tools: EditorTool[];
  types: Array<{ id: string; label: string }>;
  colors: Array<{ id: string; label: string }>;
  type: string;
  color: string;
  dir: Dir;
  selected: {
    id: string;
    keyId: string | null;
    keyOptions: Array<{ id: string; label: string }>;
    canKey: boolean;
    mystery: boolean;
    /** Schalter "Mystery" anzeigen (Ruleset erlaubt es oder das Fahrzeug ist schon markiert). */
    canMystery: boolean;
  } | null;
  rulesets: Array<{ id: string; name: string }>;
  rulesetId: string;
  size: { width: StepperVm; height: StepperVm };
  slots: StepperVm;
  visible: StepperVm;
  /** Schalter "Abbiegepfeile" (Override); null, wenn das Ruleset sie selbst erlaubt. */
  turnsRule: boolean | null;
  passengers: {
    colors: string[];
    labels: string[];
    manual: boolean;
    swapIndex: number | null;
    shuffleEnabled: boolean;
    shuffleWindow: StepperVm;
  };
  title: string;
  titleMax: number;
  status: { text: string; tone: StatusTone };
  /** Rueckmeldung zur letzten Aktion (aria-live). */
  message: string;
  shareUrl: string | null;
  canTest: boolean;
  canSave: boolean;
  canShare: boolean;
  newArmed: boolean;
}

export interface EditorHandlers {
  onBack(): void;
  onCell(x: number, y: number): void;
  onTool(tool: EditorTool): void;
  onType(id: string): void;
  onColor(id: string): void;
  onDir(dir: Dir): void;
  onRotate(): void;
  onDelete(): void;
  /** Taste R bzw. Entf auf einer Rasterzelle. */
  onRotateAt(x: number, y: number): void;
  onDeleteAt(x: number, y: number): void;
  onMove(dx: number, dy: number): void;
  onKey(keyId: string | null): void;
  onMystery(on: boolean): void;
  onSize(width: number, height: number): void;
  onRuleset(id: string): void;
  onSlots(n: number): void;
  onVisible(n: number): void;
  onTurnsRule(on: boolean): void;
  onShuffle(enabled: boolean): void;
  onShuffleWindow(n: number): void;
  onReseed(): void;
  onRegenerate(): void;
  onPassenger(index: number): void;
  onTitle(text: string): void;
  onTest(): void;
  onSave(): void;
  onShare(): void;
  onNew(): void;
}

export interface EditorView {
  el: HTMLElement;
  update(vm: EditorViewModel): void;
}
