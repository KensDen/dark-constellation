// Stored times are ISO strings in UTC (toISOString). Shown to a player they
// read in local time, the clock the Daily Op already keys on (dailyKey), so
// an evening run is listed under the date the player saw (QC gauntlet Q8).

const two = (n: number) => String(n).padStart(2, '0')

export function localDate(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso.slice(0, 10)
  return `${String(at.getFullYear()).padStart(4, '0')}-${two(at.getMonth() + 1)}-${two(at.getDate())}`
}

export function localDateTime(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso.slice(0, 16).replace('T', ' ')
  return `${localDate(iso)} ${two(at.getHours())}:${two(at.getMinutes())}`
}
