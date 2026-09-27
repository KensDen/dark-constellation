# Bundled display font

`display.woff2` is a hard subset (uppercase, digits, and the punctuation the
UI uses) of **Press Start 2P** by CodeMan38 (Cody Boisclair), converted to
woff2. It is self-hosted for the wordmark and headers so the pixel display
type renders identically on every platform, with no CDN dependency and no
platform-fallback kerning drift.

Press Start 2P is licensed under the SIL Open Font License, Version 1.1; the
full license travels with the font in `OFL.txt`. "Press Start 2P" is a
Reserved Font Name under that license. Because subsetting and the woff2
conversion make this a Modified Version, the bundled binary's own name table
(family, full, PostScript, and unique names) is renamed to the neutral name
`DC Display`, and the CSS exposes the same neutral name. The original
copyright notice, including the Reserved Font Name declaration, is retained
verbatim in the binary's copyright record and in `OFL.txt`, as the license
requires.
