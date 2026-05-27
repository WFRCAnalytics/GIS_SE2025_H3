import { cellToBoundary } from 'h3-js';

interface WorkerInput {
  hexIds: string[];
}

type WorkerOutput = Array<{ hexId: string; coords: number[][][] }>;

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { hexIds } = e.data;

  const output: WorkerOutput = hexIds.map(hexId => {
    const boundary = cellToBoundary(hexId, true); // [lng, lat] order
    const ring = [...boundary, boundary[0]] as [number, number][];
    return { hexId, coords: [ring] };
  });

  self.postMessage(output);
};
