// Credits and licensing note (R5), reachable from the menu. Short by
// design: the full terms live in LICENSE and the README.

import { GAME_TITLE } from '../config'

export default function Credits({ onBack }: { onBack: () => void }) {
  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-lg sm:text-xl text-phosphor">CREDITS</h1>
        <button className={btn} onClick={onBack}>
          BACK TO TITLE
        </button>
      </div>

      <section className="mt-5 space-y-2 text-sm">
        <p className="font-mono text-phosphor">By Ken Connell</p>
        <p>
          {GAME_TITLE} is my personal portfolio project. I did the design, code, writing, and direction.
        </p>
        <p className="font-mono text-phosphor">Artwork: AI-generated, human-commanded.</p>
        <p className="text-ink-dim">
          The key art and outcome backdrops were generated with AI tools under my direction and
          selection. The interface art (wordmark, event icons, layer badges, constellation frame) was authored as
          original vector work for this project. The pixel sprites and briefing scenes were drawn in code for this
          project.
        </p>
      </section>

      <section className="mt-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-phosphor border-b border-phosphor/20 pb-1">
          Licensing
        </h2>
        <ul className="mt-2 space-y-2 text-sm list-disc ml-5">
          <li>
            Code: copyright 2026 Ken Connell, all rights reserved. It is published to be read and reviewed; no license
            is granted to reuse it. See LICENSE in the repository (
            <a className="underline" href={REPO} target="_blank" rel="noreferrer">
              github.com/KensDen/dark-constellation
            </a>
            ), also at{' '}
            <a className="underline" href={`${import.meta.env.BASE_URL}legal/LICENSE.txt`} target="_blank" rel="noreferrer">
              /legal/LICENSE.txt
            </a>{' '}
            on this site.
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
            Display type: a subset of Press Start 2P by CodeMan38, used under the SIL Open Font License 1.1 and renamed
            DC Display as a Modified Version. The full license ships with this site at{' '}
            <a className="underline" href={`${import.meta.env.BASE_URL}legal/OFL.txt`} target="_blank" rel="noreferrer">
              /legal/OFL.txt
            </a>{' '}
            and with the font in the repository.
          </li>
          <li>
            To ask about using any of this, open an issue on{' '}
            <a className="underline" href={REPO} target="_blank" rel="noreferrer">
              the repository
            </a>
            .
          </li>
        </ul>
      </section>

      <section className="mt-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-phosphor border-b border-phosphor/20 pb-1">
          Sourcing
        </h2>
        <p className="mt-2 text-sm">
          Every adversary threat in the deck maps to a published framework technique from SPARTA, MITRE ATT&amp;CK, or MITRE
          ATLAS, each checked by hand against its live source page, with every link re-checked before each deploy. All organizations, vendors, constellations, and threat
          actors in the fiction are invented. See the GLOSSARY for every framework technique and control, and the FIELD LIBRARY for the reading
          behind the threats.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          SPARTA® is a registered trademark of The Aerospace Corporation. MITRE ATT&amp;CK® and ATT&amp;CK® are
          registered trademarks of The MITRE Corporation; MITRE ATLAS™ is a trademark of The MITRE Corporation.
          Technique and countermeasure IDs, names and tiers are cited from them for education; no endorsement is
          implied.{' '}
          <a className="underline" href={`${import.meta.env.BASE_URL}legal/THIRD-PARTY-NOTICES.txt`} target="_blank" rel="noreferrer">
            Third-party notices
          </a>
          .
        </p>
      </section>

      <button className={`${btn} mt-6`} onClick={onBack}>
        BACK TO TITLE
      </button>
    </main>
  )
}

const REPO = 'https://github.com/KensDen/dark-constellation'

const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 text-sm hover:bg-phosphor/10 disabled:opacity-40'
