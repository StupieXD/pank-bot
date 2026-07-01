export function logInfo(message) {
  console.log(`ℹ️ ${message}`);
}

export function logSuccess(message) {
  console.log(`✅ ${message}`);
}

export function logWarn(message) {
  console.warn(`⚠️ ${message}`);
}

export function logError(message, error = null) {
  console.error(`❌ ${message}`);

  if (error) {
    console.error(error);
  }
}
