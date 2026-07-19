const DURATION_PATTERN = /^(\d+)\s*(s|m|h|d|w)$/i;

const UNIT_MULTIPLIERS = Object.freeze({
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000
});

export const MINIMUM_TIMEOUT_DURATION_MS = 5 * 1000;
export const MAXIMUM_TIMEOUT_DURATION_MS = 28 * 24 * 60 * 60 * 1000;

export function parseDuration(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Duration must be a string.');
  }

  const match = value.trim().match(DURATION_PATTERN);

  if (!match) {
    throw new Error(
      'Invalid duration. Use a number followed by s, m, h, d or w (for example: 30m, 12h or 7d).'
    );
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const milliseconds = amount * UNIT_MULTIPLIERS[unit];

  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error('That duration is too large.');
  }

  return milliseconds;
}

export function validateTimeoutDuration(milliseconds) {
  if (milliseconds < MINIMUM_TIMEOUT_DURATION_MS) {
    throw new Error('Timeouts must be at least 5 seconds long.');
  }

  if (milliseconds > MAXIMUM_TIMEOUT_DURATION_MS) {
    throw new Error('Discord timeouts cannot be longer than 28 days.');
  }
}

export function formatDuration(milliseconds) {
  const units = [
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000]
  ];

  let remaining = milliseconds;
  const parts = [];

  for (const [label, size] of units) {
    const amount = Math.floor(remaining / size);

    if (amount > 0) {
      parts.push(`${amount} ${label}${amount === 1 ? '' : 's'}`);
      remaining %= size;
    }

    if (parts.length === 2) {
      break;
    }
  }

  return parts.join(' ') || '0 seconds';
}
