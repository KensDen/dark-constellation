// A recording Navigator for the haptic tier (Round 6c).
//
// Reviewed as product code, per principle 15, because Round 6b had three
// separate defects that lived in a double rather than in the thing it
// stood in for. The constants below are the ones that could mask a class
// of bug, and each is chosen against a specific way the real thing differs
// from the obvious model.
//
// NAMED CONSTANTS AND WHY THEY ARE WHAT THEY ARE:
//
// - `vibrate` is OPTIONAL on the type and genuinely ABSENT on the Firefox
//   fake, not a function returning false. That is the whole of constraint
//   one: Firefox 129 removed the API, so a fake that always supplied the
//   method could not tell a browser that refuses from a browser that has
//   no such property, and `if (nav.vibrate(x))` would be a TypeError in
//   the field while every test passed.
//
// - The desktop fake returns TRUE from vibrate, not false. That is the
//   trap in constraint two: desktop Chrome implements the API, reports
//   success, and has no motor. A fake returning false there would let a
//   capability check that reads the return value look correct.
//
// - `userAgentData` is ABSENT on the Firefox and Safari fakes rather than
//   `{ mobile: false }`, because it genuinely is: it is a Chromium
//   feature. A fake that always supplied it would hide the UA fallback
//   entirely, which is the only signal those browsers offer.
//
// - `calls` records the ARGUMENT, not a count. "It vibrated" is not the
//   claim any guard here wants to make; "it vibrated with the pattern the
//   registry declares" is, and a counter cannot answer that. Round 6b's
//   duck guard passed on a sentinel because it aggregated instead of
//   looking.

export interface VibrateCall {
  pattern: number | number[]
}

export class FakeNavigator {
  readonly calls: VibrateCall[] = []
  vibrate?: (pattern: number | number[]) => boolean
  userAgentData?: { mobile?: boolean }
  userAgent?: string

  private constructor(opts: {
    hasVibrate: boolean
    returns?: boolean
    uaDataMobile?: boolean
    userAgent?: string
  }) {
    if (opts.hasVibrate) {
      this.vibrate = (pattern) => {
        this.calls.push({ pattern })
        return opts.returns ?? true
      }
    }
    if (typeof opts.uaDataMobile === 'boolean') this.userAgentData = { mobile: opts.uaDataMobile }
    this.userAgent = opts.userAgent
  }

  // The tier this round ships to: Chrome on an Android phone.
  static androidChrome(): FakeNavigator {
    return new FakeNavigator({
      hasVibrate: true,
      uaDataMobile: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
    })
  }

  // Chrome on a laptop: the API is there, it answers yes, nothing moves.
  static desktopChrome(): FakeNavigator {
    return new FakeNavigator({
      hasVibrate: true,
      uaDataMobile: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    })
  }

  // Firefox 129 and later: the property is GONE, and no userAgentData.
  static firefoxAndroid(): FakeNavigator {
    return new FakeNavigator({
      hasVibrate: false,
      userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
    })
  }

  // iPhone: no Vibration API at all, and the tier is dropped by decision.
  static iphoneSafari(): FakeNavigator {
    return new FakeNavigator({
      hasVibrate: false,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1',
    })
  }

  // An Android browser with the API but no userAgentData, which is the
  // only case that exercises the UA fallback rather than the hint.
  static androidNoHints(): FakeNavigator {
    return new FakeNavigator({
      hasVibrate: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 Chrome/119.0.0.0 Mobile Safari/537.36',
    })
  }

  // AN ANDROID TABLET, and the only fake where the two mobile signals
  // DISAGREE: userAgentData.mobile is FALSE on a tablet while the UA string
  // still says Android. Without it, the hint and the string agreed on every
  // fake in the file, so deleting the hint branch entirely changed no
  // answer and the mutation slept. It is also the case that decides a real
  // question rather than a hypothetical one, since tablets do have motors.
  static androidTablet(): FakeNavigator {
    return new FakeNavigator({
      hasVibrate: true,
      uaDataMobile: false,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    })
  }

  // A browser that exposes `vibrate` as something other than a function.
  // Not a browser anyone ships, but the case that separates "the property
  // is a callable" from "the property is truthy", which is the difference
  // between detection that survives Firefox 129 and detection that only
  // looks like it does.
  static vibrateNotCallable(): FakeNavigator {
    const nav = FakeNavigator.androidChrome()
    ;(nav as { vibrate?: unknown }).vibrate = true
    return nav
  }

  // A browser that throws on vibrate, which some do behind a permissions
  // policy rather than returning false.
  static throwsOnVibrate(): FakeNavigator {
    const nav = FakeNavigator.androidChrome()
    nav.vibrate = () => {
      throw new DOMException('vibration blocked by permissions policy')
    }
    return nav
  }

  reset(): void {
    this.calls.length = 0
  }
}
