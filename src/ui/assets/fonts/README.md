# Bundled display font

`display.woff2` is a hard subset (uppercase, digits, and the punctuation the
UI uses) of **Press Start 2P** by CodeMan38 (Cody Boisclair), encoded as
WOFF2. It is self-hosted for the wordmark and headers so the pixel display
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

## Encoding

The subset was built as TrueType, and until v1.2 Round 4b that TrueType
data shipped under this name while the CSS declared it `format('woff2')`.
It is now real WOFF2, encoded from that same TrueType subset with fontTools
and Brotli, which produce the same bytes on every run. Run it in this
directory, so the result replaces the file here, then delete display.ttf:

    python3 -m venv .venv-fonts
    .venv-fonts/bin/pip install fonttools==4.66.0 brotli==1.2.0
    git show 290a472:src/ui/assets/fonts/display.woff2 > display.ttf
    .venv-fonts/bin/fonttools ttLib.woff2 compress -o display.woff2 display.ttf

The TrueType source is the file at commit 290a472 (15,456 bytes, sha256
9fa4f476f824c5dc0a46607ea5ffcc9da311b3bfac1a47d753137041e5d54092). The
result is 5,636 bytes (sha256
b78805da441d7e68efa68170a5499f1574063be8a3a5ca77b533fcc470b41067). The
encoding changes the container, not the font: the character map (58
characters), the glyph order, every glyph outline, the metrics and the
name table, renamed names and copyright record included, are identical
to the source's.
