// THE COUNTDOWN TO THE NEXT DAILY OP (v1.3 R4, brief 5.1 and 5.6), on the
// title once today's official run is in. A component of its own so only it
// renders once a second, never the screen around it.

import { msUntilNextDaily } from '../engine/daily'
import { hms, useNow } from './dailyClock'

export default function Countdown({ className }: { className?: string }) {
  const now = useNow()
  return <span className={className}>{hms(msUntilNextDaily(now))}</span>
}
