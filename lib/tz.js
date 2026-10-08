'use strict';

const DEFAULT_TZ = 'Asia/Kolkata';

function getTomorrowInfo(timeZone = process.env.TZ_NAME || DEFAULT_TZ, now = new Date()) {
  let tz = timeZone;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    tz = DEFAULT_TZ;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.format(now).split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  const tomorrowUtc = new Date(Date.UTC(year, month - 1, day + 1));

  const tomYear = tomorrowUtc.getUTCFullYear();
  const tomMonth = String(tomorrowUtc.getUTCMonth() + 1).padStart(2, '0');
  const tomDay = String(tomorrowUtc.getUTCDate()).padStart(2, '0');
  const dayString = `${tomYear}-${tomMonth}-${tomDay}`;

  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(tomorrowUtc);
  const monthShort = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(tomorrowUtc);
  const dayNum = tomorrowUtc.getUTCDate();
  const dayLabel = `${weekday}, ${dayNum} ${monthShort}`;

  return {
    day: dayString,
    dayLabel
  };
}

module.exports = {
  DEFAULT_TZ,
  getTomorrowInfo
};
