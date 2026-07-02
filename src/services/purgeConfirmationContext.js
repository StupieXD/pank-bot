const pendingPurges = new Map();

export function savePendingPurge(id, data) {
  pendingPurges.set(id, {
    ...data,
    timestamp: Date.now()
  });

  setTimeout(() => {
    pendingPurges.delete(id);
  }, 30000);
}

export function getPendingPurge(id) {
  return pendingPurges.get(id);
}

export function deletePendingPurge(id) {
  pendingPurges.delete(id);
}
