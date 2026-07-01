export function logInfo(message) {
  console.log(`ℹ️ ${message}`);
}

export function logSuccess(message) {
  console.log(`✅ ${message}`);
}

export function logError(message, error = null) {
  console.log(`❌ ${message}`);

  if (error) {
    console.log(error);
  }
}
