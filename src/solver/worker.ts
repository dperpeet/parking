// Web-Worker-Einstieg: SolveRequest -> SolveResponse.
import { handleRequest } from './handle';
import type { SolveRequest, SolveResponse } from './types';

interface WorkerScope {
  onmessage: ((e: MessageEvent<SolveRequest>) => void) | null;
  postMessage(message: SolveResponse): void;
}

const scope = self as unknown as WorkerScope;
scope.onmessage = (e) => scope.postMessage(handleRequest(e.data));
