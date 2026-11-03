// Anfrage-Behandlung des Solver-Workers (ohne Worker-Globals, damit testbar).
import { analyze } from './analyze';
import { generate } from './generator';
import { hintMove } from './hint';
import type { SolveRequest, SolveResponse } from './types';

/** Bearbeitet eine Anfrage synchron (auch direkt in Tests nutzbar). */
export function handleRequest(req: SolveRequest): SolveResponse {
  try {
    switch (req.kind) {
      case 'analyze':
        return {
          id: req.id,
          ok: true,
          kind: 'analyze',
          result: analyze(req.level, req.rules, req.opts),
        };
      case 'hint':
        return { id: req.id, ok: true, kind: 'hint', result: hintMove(req.state, req.rules) };
      case 'generate':
        return { id: req.id, ok: true, kind: 'generate', result: generate(req.params, req.rules) };
    }
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
