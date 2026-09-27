// Credits and licensing note (R5), reachable from the menu. Short by
// design: the full terms live in LICENSE and the README.

import { GAME_TITLE } from '../config'

export default function Credits({ onBack }: { onBack: () => void }) {
  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-lg sm:text-xl text-phosphor">CREDITS</h1>
        <button className={btn} onClick={onBack}>
          Back to menu
        </button>
      </div>

      <section className="mt-5 space-y-2 text-sm">
        <p>
          {GAME_TITLE} is a personal portfolio project by Ken Connell. Design, code, writing, and direction by
          the author.
        </p>
        <p className="font-mono text-phosphor">Artwork: AI-generated, human-directed.</p>
        <p className="text-ink-dim">
          The key art, intro, and outcome backdrops were generated with AI tools under the author&apos;s direction and
          selection. The interface art (wordmark, event icons, layer badges, constellation frame) was authored as
          original vector work for this project.
        </p>
      </section>

      <section className="mt-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-phosphor border-b border-phosphor/20 pb-1">
          Licensing
        </h2>
        <ul className="mt-2 space-y-2 text-sm list-disc ml-5">
          <li>
            Code: copyright 2026 Ken Connell, all rights reserved. It is published to be read and reviewed; no license
            is granted to reuse it. See LICENSE in the repository.
          </li>
          <li>
            Artwork and written content: copyright 2026 Ken Connell, all rights reserved. They were never covered by
            the MIT license.
          </li>
          <li>
            Earlier versions: the v1.0.0 and v1.1.0 releases and every commit up to and including 26c9ed0 released
            their code under the MIT License. That grant still applies to copies of those versions; it does not apply
            to anything added or changed after them. The public history was restarted on 27 September 2026, so those
            commits no longer appear in it.
          </li>
          <li>
            Display type: a subset of Press Start 2P by CodeMan38, used under the SIL Open Font License 1.1. The full
            license ships with the font in the repository.
          </li>
          <li>To ask about using any of this, open an issue on the repository.</li>
        </ul>
      </section>

      <section className="mt-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-phosphor border-b border-phosphor/20 pb-1">
          Sourcing
        </h2>
        <p className="mt-2 text-sm">
          Every threat in the deck maps to a published framework technique from SPARTA, MITRE ATT&amp;CK, or MITRE
          ATLAS, each verified against the live framework site. All organizations, vendors, constellations, and threat
          actors in the fiction are invented. See the GLOSSARY for the full reference list.
        </p>
      </section>

      <button className={`${btn} mt-6`} onClick={onBack}>
        Back to menu
      </button>
    </main>
  )
}

const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 text-sm hover:bg-phosphor/10 disabled:opacity-40'
