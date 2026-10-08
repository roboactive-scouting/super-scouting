import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatCount } from '@frc/shared';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Note, SuccessBanner } from '@/components/ui/notice';
import { stationLabel, WarningFlag } from '@/components/ui/tag';
import { setStation } from '@/data/station';
import { matchLabel } from '@/lib/matchLabel';
import { entryPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { ensureMatchLocally } from './bareMatch';
import { LineupTiles, OtherStationDialog } from './LineupTiles';
import { editableUntil, editsAnyTime, type Editor } from './localEntries';
import { MatchFields } from './MatchFields';
import { RosterHeading, RosterList } from './RosterList';
import { hhmm } from './scoutChoice';
import { StationHeading, StationSheet } from './StationSheet';
import { useScoutSelection } from './useScoutSelection';

/** What EntryRoute hands back through router state after a submit (SPEC-FINAL 8.1). */
export type SavedNotice = {
  matchType: string;
  number: number;
  matchLabel: string;
  teamLabel: string;
  edited: boolean;
};

const TYPE_NAME: Record<string, string> = {
  qualification: 'Qualification',
  practice: 'Practice',
  playoff: 'Playoff',
};

export function SelectRobotPage({ eventId, author }: { eventId: string; author: Editor }) {
  const navigate = useNavigate();
  const saved = (useLocation().state as { saved?: SavedNotice } | null)?.saved;
  // SPEC-FINAL 8.1 (v1.17): after a new entry the type stays and the next number is offered,
  // still editable and with no robot carried over; after an edit the number stays empty.
  const next = saved && !saved.edited && saved.number ? saved : null;
  const [matchType, setMatchType] = useState(next?.matchType ?? 'qualification');
  const [number, setNumber] = useState(next ? String(next.number + 1) : '');
  const [asking, setAsking] = useState<'auto' | 'open' | 'closed'>('auto');
  const starting = useRef(false);
  const pick = useScoutSelection(eventId, author, matchType, number);
  const { station, parsed, valid, existing, chosen, notHere, showLineup } = pick;

  /** One tap, one bare match and one outbox operation, however fast the second tap comes. */
  function start() {
    if (!chosen || starting.current) return;
    starting.current = true;
    const { team, entry } = chosen;
    // Editing keeps the alliance the entry was recorded with.
    const side = entry?.alliance ?? chosen.side;
    ensureMatchLocally(existing, { eventId, matchType, number: parsed, author })
      .then((matchId) => navigate(entryPath(matchId, team.id, side)))
      .finally(() => {
        starting.current = false;
      });
  }

  const shortMatch = valid ? matchLabel({ match_type: matchType, number: parsed }) : '';
  const longMatch = `${TYPE_NAME[matchType] ?? matchType} ${formatCount(parsed)}`;

  return (
    // data-pinned-foot: on a phone the page fills the height, so a short page still has its
    // action bar at the bottom, flush on the bottom bar (THEME "Primary action bar").
    <main
      data-pinned-foot=""
      className="mx-auto flex w-full max-w-[920px] flex-1 flex-col px-4 pt-3.5 lg:px-8 lg:pt-6"
    >
      <div className="flex-1">
        {saved && (
          // Static on purpose (SPEC-FINAL 17.9): the confirmation stands still on the entry path.
          // Submitting only queues the entry; the connection indicator owns sync state.
          <div role="status" aria-label="Entry saved" className="mb-4 lg:mb-[18px]">
            <SuccessBanner
              title={
                <>
                  {saved.edited ? 'Changes saved on this device' : 'Entry saved on this device'}
                  <span className="font-normal text-ink-2">
                    {' · '}
                    {saved.matchLabel} · <span dir="auto">{saved.teamLabel}</span>
                  </span>
                </>
              }
            >
              It is queued to send and stays safe here with no network.
            </SuccessBanner>
          </div>
        )}

        {notHere ? (
          <RosterHeading
            sub={`${longMatch}${station ? ` · your station ${stationLabel(station)}` : ''}`}
            onCancel={pick.closeNotHere}
          />
        ) : (
          <>
            <StationHeading station={station} onChange={() => setAsking('open')} />
            <MatchFields
              matchType={matchType}
              onMatchType={setMatchType}
              number={number}
              onNumber={setNumber}
            />
          </>
        )}

        {showLineup && (
          <LineupTiles
            tiles={pick.tiles}
            mine={station ?? null}
            selected={pick.selected}
            onPick={pick.pickTile}
            shortMatch={shortMatch}
            longMatch={longMatch}
            onNotHere={pick.openNotHere}
          />
        )}

        {valid && !showLineup && (
          <section className={cn('flex flex-col gap-3', notHere ? 'mt-3.5' : 'mt-3')}>
            {!notHere &&
              (existing ? (
                <Note>
                  {shortMatch} has no robots listed on this device. Choose the one you are watching.
                </Note>
              ) : (
                <div role="status">
                  <Note>
                    Match {formatCount(parsed)} is not on this device yet. It will be created when
                    you submit — keep scouting.
                  </Note>
                </div>
              ))}
            <RosterList
              alliance={pick.alliance}
              onAlliance={pick.onAlliance}
              teams={pick.roster}
              value={pick.rosterValue}
              onChange={pick.pickTeam}
              query={pick.query}
              onQuery={pick.onQuery}
            >
              {pick.flagged && chosen && (
                <Note className="mt-1">
                  <WarningFlag>Not in line-up</WarningFlag>
                  <span className="mt-1.5 block">
                    {chosen.team.number} isn't in {shortMatch}'s line-up. The entry is saved with
                    this mark so a lead can check it. The match itself doesn't change.
                  </span>
                </Note>
              )}
            </RosterList>
          </section>
        )}

        {chosen?.entry && (
          <Note className="mt-3">
            {editsAnyTime(author)
              ? 'This robot is already scouted in this match on this device. You can change that entry; a second one cannot be started.'
              : `This robot is already scouted in this match on this device. You can change that entry until ${hhmm(
                  editableUntil(chosen.entry),
                )}; a second one cannot be started.`}
          </Note>
        )}
      </div>

      {/* The primary action bar, pinned at every width: a long roster never hides it. */}
      <ActionBar desktop="flat">
        <Button variant="primary" size="block" disabled={!chosen} onClick={start}>
          {!chosen
            ? 'Start entry'
            : chosen.entry
              ? 'Edit the existing entry'
              : `Start entry · ${chosen.team.number} ${chosen.team.name}`}
        </Button>
      </ActionBar>

      <StationSheet
        open={asking === 'open' || (asking === 'auto' && station === null)}
        current={station ?? null}
        onClose={() => setAsking('closed')}
        onUse={(s) => {
          setAsking('closed');
          void setStation(s);
        }}
      />
      {station && (
        <OtherStationDialog
          mine={station}
          target={pick.confirming}
          onKeep={pick.keepStation}
          onScout={pick.scoutOther}
        />
      )}
    </main>
  );
}
