// Credits and licensing note (R5), reachable from the menu. Short by
// design: the full terms live in LICENSE and the README.

import { GAME_TITLE } from '../config'
import { DC_BTN } from './buttons'
import './rooms.css'

export default function Credits({ onBack }: { onBack: () => void }) {
  return (
    <main className="rm">
      {/* The same 44 px control as every other BACK TO TITLE, on the left as
          on LIBRARY and the scoreboard (R6 question 14), in the same bar
          (v2.0 R4). */}
      <div className="rm-head">
        <button type="button" className={DC_BTN} onClick={onBack}>
          BACK TO TITLE
        </button>
        <h1>CREDITS</h1>
      </div>

      {/* Who and how across the top; the two long notes are two cards of
          glass, side by side on a desk. */}
      <div className="rm-body rm-pair">
      <section className="rm-list">
        <p className="rm-name">By Ken Connell</p>
        <p>
          {GAME_TITLE} is my personal portfolio project. I did the design, code, writing, and direction.
        </p>
        <p className="rm-name">Artwork: AI-generated, human-commanded.</p>
        <p className="tt-note">
          The README banner and the link preview image were generated with AI tools under my direction and selection.
          The wordmark is set in the DC Display face, and the world of the game, on the title and in play (the globe,
          the fleet, COLDVEIL and every effect), is built in code for this project, with no image files.
        </p>
      </section>

      <section className="rm-card">
        <h2 className="tt-label tt-sky uppercase">Licensing</h2>
        <ul className="rm-list rm-disc">
          <li>
            Code: copyright 2026 Ken Connell, all rights reserved. It is published to be read and reviewed; no license
            is granted to reuse it. See LICENSE in the repository (
            <a className="rm-a" href={REPO} target="_blank" rel="noreferrer">
              github.com/KensDen/dark-constellation
            </a>
            ), also at{' '}
            <a className="rm-a" href={`${import.meta.env.BASE_URL}legal/LICENSE.txt`} target="_blank" rel="noreferrer">
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
            <a className="rm-a" href={`${import.meta.env.BASE_URL}legal/OFL.txt`} target="_blank" rel="noreferrer">
              /legal/OFL.txt
            </a>{' '}
            and with the font in the repository.
          </li>
          <li>
            To ask about using any of this, open an issue on{' '}
            <a className="rm-a" href={REPO} target="_blank" rel="noreferrer">
              the repository
            </a>
            .
          </li>
        </ul>
      </section>

      <section className="rm-card">
        <h2 className="tt-label tt-sky uppercase">Sourcing</h2>
        <p>
          Every adversary threat in the deck maps to a published framework technique from SPARTA, MITRE ATT&amp;CK®, or MITRE
          ATLAS, each checked by hand against its live source page, with every link re-checked before each deploy. All organizations, vendors, constellations, and threat
          actors in the fiction are invented. See the GLOSSARY for every framework technique and control, and the FIELD LIBRARY for the reading
          behind the threats.
        </p>
        <p className="tt-note">
          SPARTA® is a registered trademark of The Aerospace Corporation. MITRE ATT&amp;CK® and ATT&amp;CK® are
          registered trademarks of The MITRE Corporation; MITRE ATLAS™ is a trademark of The MITRE Corporation.
          Technique and countermeasure IDs, names and tiers are cited from them for education; no endorsement is
          implied.{' '}
          <a className="rm-a" href={`${import.meta.env.BASE_URL}legal/THIRD-PARTY-NOTICES.txt`} target="_blank" rel="noreferrer">
            Third-party notices
          </a>
          .
        </p>
      </section>

      <button type="button" className={`${DC_BTN} rm-start`} onClick={onBack}>
        BACK TO TITLE
      </button>
      </div>
    </main>
  )
}

const REPO = 'https://github.com/KensDen/dark-constellation'

