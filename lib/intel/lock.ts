type DeskLock = { __prngScan?: boolean };

export function claimDeskLock() {
  const lock = globalThis as typeof globalThis & DeskLock;
  if (lock.__prngScan) return false;
  lock.__prngScan = true;
  return true;
}

export function releaseDeskLock() {
  const lock = globalThis as typeof globalThis & DeskLock;
  lock.__prngScan = false;
}
