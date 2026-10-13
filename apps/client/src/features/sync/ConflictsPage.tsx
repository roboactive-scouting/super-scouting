import { Check, Copy, GitMerge, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  can,
  formatCount,
  formatTime,
  type ConflictItem,
  type ListConflictsOutput,
  type Role,
  type SettledConflict,
} from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorLine, Note } from '@/components/ui/notice';
import { AllianceTag, StationTag, SuperTag } from '@/components/ui/tag';
import { cachedEventName } from '@/data/cache';
import { RpcError, typedCall, type Rpc } from '@/data/rpc';
import { PATHS } from '@/lib/paths';
import { useOnline } from '@/lib/useOnline';
import { cn } from '@/lib/utils';
import { ConflictDiff } from './ConflictDiff';
import {
  cardOf,
  localMidnight,
  readCachedConflicts,
  readCacheLookups,
  readCardContext,
  settledLineOf,
  shortName,
  type CardAction,
  type ConflictCard,
  type SettledLine,
} from './conflictsView';

/** How long a choice can be taken back before the resolve command is sent (README, "Undo"). */
export const UNDO_MS = 5_000;
/**
 * The page's own deadline for a call: past it the queue falls back to the cache and a send
 * reopens its card with the error, instead of waiting as long as the browser cares to.
 */
export const CONFLICTS_CALL_TIMEOUT_MS = 10_000;
/** A runaway cursor cannot page forever: the queue is two or three items at a venue. */
const MAX_PAGES = 20;

const DEFAULT_RPC: Rpc = {
  call: (name, input, options) =>
    typedCall(name, input, { timeoutMs: CONFLICTS_CALL_TIMEOUT_MS, ...options }),
};

export type ConflictsPageProps = {
  /** The event this device works on. */
  eventId: string;
  /** Who is looking: a lead or an admin resolves; a scouter reads (SPEC-FINAL 9.5). */
  role: Role;
  /** The viewer's name, for a Settled today line before the server's own arrives. */
  viewerName?: string | null;
  rpc?: Rpc;
  /** One push-then-pull through the shell's queue, so the cache catches up after a resolve. */
  syncNow?: () => Promise<unknown>;
};

type View = {
  cards: ConflictCard[];
  settled: SettledLine[];
  /** Why the queue shown may not be the latest, as a sentence (a refusal, an unreadable cache). */
  problem: string | null;
};

/** A choice counting down (or, once its countdown ends, being sent). */
type Pending = {
  card: ConflictCard;
  action: CardAction;
  deadline: number;
  timer: ReturnType<typeof setTimeout> | null;
  sending: boolean;
};

type Outcome = 'settled' | 'taken' | 'gone' | 'failed' | 'skipped';

const sentence = (line: string) => {
  const trimmed = line.trim();
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

/**
 * Both sources into one view: the server's items, or the same rebuilt from the cache. The cache
 * also names a duplicate's removed copy in Settled today, which the server's line does not.
 */
async function viewOf(
  items: ConflictItem[],
  settled: SettledConflict[],
  cache: Awaited<ReturnType<typeof readCacheLookups>>,
  problem: string | null,
): Promise<View> {
  const ctx = await readCardContext();
  const rows = new Map(cache.conflicts.map((c) => [c.id, c]));
  return {
    cards: items.map((item) => cardOf(item, ctx)),
    settled: settled.map((s) => settledLineOf(s, cache.look, rows.get(s.id))),
    problem,
  };
}

/**
 * `/conflicts` (18-conflicts final, variant C; SPEC-FINAL 9.5, 9.6, 17.9): the review worklist.
 * One scroll of cards, oldest first, each showing only the differing fields until "Show the n
 * that match". A choice folds its card to a "Kept …" line with Undo and a 5-second countdown;
 * the resolve command goes only when the countdown ends (there is no server undo), at once when
 * the page is left, and a failed send reopens the card with the error. Readable offline from
 * the cache and by a scouter; resolving needs a lead or an admin, and a connection.
 */
export function ConflictsPage({
  eventId,
  role,
  viewerName = null,
  rpc = DEFAULT_RPC,
  syncNow,
}: ConflictsPageProps) {
  const online = useOnline();
  const lead = can({ kind: 'user', userId: '', role }, 'resolve_conflict');
  const canResolve = lead && online;

  const [view, setView] = useState<View>();
  const [eventName, setEventName] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [notes, setNotes] = useState<string[]>([]);
  /** Settled or dropped on this page: never shown again, whatever a reload still says. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [justSettled, setJustSettled] = useState<SettledLine[]>([]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const pending = useRef(new Map<string, Pending>());
  const mounted = useRef(true);
  const loadRun = useRef(0);
  const latest = useRef({ rpc, syncNow, viewerName });
  latest.current = { rpc, syncNow, viewerName };

  /** Reads the queue: the server's when online, else (or when that fails) this device's cache. */
  const read = useCallback(async (): Promise<View> => {
    const cache = await readCacheLookups();
    const fromCache = async (problem: string | null) => {
      const cached = await readCachedConflicts(eventId, localMidnight(), cache);
      return viewOf(cached.items, cached.settled, cache, problem);
    };
    if (!navigator.onLine) return fromCache(null);
    try {
      const items: ConflictItem[] = [];
      let settled: SettledConflict[] | null = null;
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const answer = (await rpc.call('listConflicts', {
          event_id: eventId,
          settled_since: localMidnight(),
          ...(cursor ? { cursor } : {}),
        })) as ListConflictsOutput;
        items.push(...answer.items);
        settled ??= answer.settled ?? [];
        cursor = answer.next_cursor ?? undefined;
        if (!cursor) break;
      }
      return await viewOf(items, settled ?? [], cache, null);
    } catch (e) {
      // No connection (or no answer in time): the cache, said by the offline line when the
      // device knows it is offline. A refusal from our own server is said.
      return fromCache(
        e instanceof RpcError && e.answered
          ? `Couldn’t read the latest queue: ${sentence(e.message)} Showing what this device holds.`
          : null,
      );
    }
  }, [eventId, rpc]);

  /** `read`, kept to the latest run; a failed read keeps what is on screen (useDeviceQuery's rule). */
  const load = useCallback(async () => {
    const mine = ++loadRun.current;
    try {
      const next = await read();
      if (mounted.current && mine === loadRun.current) setView(next);
    } catch {
      if (mounted.current && mine === loadRun.current) {
        setView(
          (shown) =>
            shown ?? {
              cards: [],
              settled: [],
              problem: 'This device could not read its own copy of the queue.',
            },
        );
      }
    }
  }, [read]);

  useEffect(() => {
    void load();
  }, [load, online]);

  useEffect(() => {
    let live = true;
    void cachedEventName(eventId).then((name) => live && setEventName(name));
    return () => {
      live = false;
    };
  }, [eventId]);

  /**
   * Sends one choice now. Its card stays folded while it goes; the outcome decides what next:
   * settled → the card leaves and the queue and the cache are refreshed; someone else settled
   * it (409) or an entry it names is gone (404) → the card is dropped with a word; anything
   * else → the card reopens with the error.
   */
  const send = useCallback(async (id: string, keepalive = false): Promise<Outcome> => {
    const p = pending.current.get(id);
    if (!p || p.sending) return 'skipped';
    if (p.timer !== null) clearTimeout(p.timer);
    p.timer = null;
    p.sending = true;
    if (mounted.current) rerender();
    const input = { conflict_id: id, resolution: p.action.resolution };
    let outcome: Outcome;
    let message = '';
    try {
      await (keepalive
        ? latest.current.rpc.call('resolveConflict', input, { keepalive: true })
        : latest.current.rpc.call('resolveConflict', input));
      outcome = 'settled';
    } catch (e) {
      const code = e instanceof RpcError ? e.code : '';
      outcome = code === 'conflict' ? 'taken' : code === 'not-found' ? 'gone' : 'failed';
      message = e instanceof Error ? e.message : 'that did not work';
    }
    pending.current.delete(id);
    if (!mounted.current) return outcome;
    const { card, action } = p;
    if (outcome === 'failed') {
      setErrors((all) => ({ ...all, [id]: `Not settled: ${sentence(message)}` }));
      rerender();
      return outcome;
    }
    setHidden((all) => new Set(all).add(id));
    if (outcome === 'settled') {
      const now = new Date();
      setJustSettled((all) => [
        {
          id,
          title: [card.match ?? (card.form_kind === 'super' ? 'Super' : null), card.team?.number]
            .filter((x) => x !== null && x !== undefined)
            .join(' · '),
          what: action.logged,
          time: formatTime(now.toISOString()),
          by: shortName(latest.current.viewerName),
          at: now.getTime(),
        },
        ...all.filter((l) => l.id !== id),
      ]);
    } else {
      setNotes((all) => [
        ...all,
        outcome === 'taken'
          ? `${card.short}: someone else settled this one first.`
          : `${card.short}: an entry it names no longer exists.`,
      ]);
    }
    return outcome;
  }, []);

  /** After sends: the queue again, and a sync so the cache holds the settled rows (README). */
  const afterSends = useCallback(
    (outcomes: Outcome[]) => {
      if (outcomes.some((o) => o === 'settled' || o === 'taken' || o === 'gone')) {
        if (mounted.current) void load();
        if (outcomes.includes('settled')) void latest.current.syncNow?.()?.catch(() => undefined);
      }
    },
    [load],
  );

  /** Every pending choice goes at once: the page is being left (route change, unmount, pagehide). */
  const flush = useCallback(
    (keepalive: boolean) => {
      const ids = [...pending.current.entries()].filter(([, p]) => !p.sending).map(([id]) => id);
      if (ids.length === 0) return;
      void Promise.all(ids.map((id) => send(id, keepalive))).then(afterSends);
    },
    [send, afterSends],
  );

  useEffect(() => {
    mounted.current = true;
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      mounted.current = false;
      flush(false);
    };
  }, [flush]);

  // The countdown's seconds: one tick a second while any choice is counting down.
  const counting = [...pending.current.values()].some((p) => !p.sending);
  useEffect(() => {
    if (!counting) return;
    const tick = setInterval(rerender, 1_000);
    return () => clearInterval(tick);
  }, [counting]);

  const choose = (card: ConflictCard, action: CardAction) => {
    if (!canResolve || pending.current.has(card.id)) return;
    setErrors(({ [card.id]: _gone, ...rest }) => rest);
    const timer = setTimeout(() => {
      void send(card.id).then((o) => afterSends([o]));
    }, UNDO_MS);
    pending.current.set(card.id, {
      card,
      action,
      deadline: Date.now() + UNDO_MS,
      timer,
      sending: false,
    });
    rerender();
  };

  const undo = (id: string) => {
    const p = pending.current.get(id);
    if (!p || p.sending) return;
    if (p.timer !== null) clearTimeout(p.timer);
    pending.current.delete(id);
    rerender();
  };

  const toggle = (id: string) =>
    setExpanded((all) => {
      const next = new Set(all);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const cards = (view?.cards ?? []).filter((c) => !hidden.has(c.id));
  // A card folded by a choice stays in its place; one being sent too.
  const open = cards.filter((c) => !pending.current.has(c.id));
  const anyPending = pending.current.size > 0;
  const fromServer = new Set((view?.settled ?? []).map((s) => s.id));
  const settled = [...justSettled.filter((s) => !fromServer.has(s.id)), ...(view?.settled ?? [])];
  const left = open.length;
  const sub = [
    eventName,
    view === undefined
      ? null
      : left === 0 && !anyPending
        ? 'all settled'
        : `${formatCount(left)} to review`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="flex w-full max-w-[71rem] flex-col gap-3 px-3.5 pt-3.5 pb-8 lg:gap-3.5 lg:px-8 lg:pt-6">
      <header>
        <h1 className="text-2xl font-[750] tracking-tight lg:text-[1.625rem]">Conflicts</h1>
        {sub && (
          <p className="mt-0.5 text-[0.8125rem] text-muted lg:text-[0.9375rem]" dir="auto">
            {sub}
          </p>
        )}
      </header>

      {!online && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-card border border-warn/25 bg-warn-tint px-3 py-2.5 text-[0.8125rem] leading-snug text-ink"
        >
          <WifiOff aria-hidden="true" className="mt-px size-[18px] shrink-0 text-warn" />
          <span>
            <b className="font-bold">Offline.</b> You can read these, but resolving needs a
            connection, because it settles the entry for everyone.
          </span>
        </div>
      )}
      {!lead && (
        <Note icon="info" className="py-2.5 text-[0.8125rem]">
          <b className="font-bold text-ink">A lead or an admin resolves these.</b> Until then the
          copy marked “Counted now” is the one in the statistics.
        </Note>
      )}
      {view?.problem && <ErrorLine announce={false}>{view.problem}</ErrorLine>}
      {notes.map((note, i) => (
        <Note key={i} icon="info" className="py-2.5 text-[0.8125rem]">
          <span role="status">{note}</span>
        </Note>
      ))}

      {view === undefined ? (
        <Skeleton rows={4} label="Loading the conflicts" />
      ) : (
        <>
          {cards.map((card) => {
            const p = pending.current.get(card.id);
            return p ? (
              <SettledFold
                key={card.id}
                card={card}
                action={p.action}
                seconds={Math.max(1, Math.ceil((p.deadline - Date.now()) / 1_000))}
                sending={p.sending}
                onUndo={() => undo(card.id)}
              />
            ) : (
              <ConflictCardView
                key={card.id}
                card={card}
                expanded={expanded.has(card.id)}
                onToggle={() => toggle(card.id)}
                disabled={!canResolve}
                error={errors[card.id] ?? null}
                onChoose={(action) => choose(card, action)}
              />
            );
          })}
          {cards.length === 0 && !view.problem && (
            <EmptyState
              icon={Check}
              tone="success"
              title="Nothing left to review"
              detail="Every copy is settled. New conflicts appear here after a sync."
              className="py-[26px] lg:max-w-md"
              action={
                <Link to={PATHS.sync} className={buttonVariants({ variant: 'secondary' })}>
                  Back to Sync
                </Link>
              }
            />
          )}
          {settled.length > 0 && <SettledToday lines={settled} />}
        </>
      )}
    </main>
  );
}

/** The card's head: match (or SUPER), station, team; the kind in words and how many fields differ. */
function CardHead({ card, expanded }: { card: ConflictCard; expanded: boolean }) {
  const KindIcon = card.kind === 'duplicate' ? Copy : GitMerge;
  return (
    <div className="flex flex-col gap-1.5 border-b border-line-2 px-3 pt-3 pb-2.5 lg:border-b-0 lg:px-4 lg:pt-3.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {card.form_kind === 'super' ? (
          <SuperTag />
        ) : card.match ? (
          <span className="num text-[0.8125rem] font-semibold text-muted">{card.match}</span>
        ) : null}
        {card.form_kind !== 'super' &&
          (card.station ? (
            <StationTag station={card.station} />
          ) : card.alliance ? (
            <AllianceTag alliance={card.alliance}>
              {card.alliance === 'red' ? 'Red' : 'Blue'}
            </AllianceTag>
          ) : null)}
        {card.team ? (
          <span className="inline-flex min-w-0 items-baseline gap-1.5">
            <span className="num text-[1.0625rem] font-semibold">{card.team.number}</span>
            <span dir="auto" className="min-w-0 truncate text-[0.90625rem] font-medium text-ink-2">
              {card.team.name}
            </span>
          </span>
        ) : (
          <span className="text-[0.90625rem] text-ink-2">Unknown team</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-tag bg-line-2 px-2 text-[0.71875rem] font-bold text-ink-2">
          <KindIcon aria-hidden="true" className="size-[13px]" />
          {card.kind === 'duplicate' ? 'Scouted twice' : 'Edited on two phones'}
        </span>
        <span className="text-xs font-[650] text-warn">
          {formatCount(card.differing)} {card.differing === 1 ? 'field differs' : 'fields differ'}
        </span>
      </div>
      <p
        dir="auto"
        className={cn(
          'text-[0.78125rem] leading-snug text-ink-2 lg:block lg:text-[0.875rem]',
          expanded ? 'block' : 'hidden',
        )}
      >
        {card.why}
      </p>
    </div>
  );
}

/**
 * THEME "Conflict card". Phone: the head, the diff, the two buttons side by side. Computer: two
 * columns — who, the kind, the explanation and the buttons stacked on the left (300 px), the
 * diff on the right. One tree, placed by grid areas, so a width change never remounts it.
 */
function ConflictCardView({
  card,
  expanded,
  onToggle,
  disabled,
  error,
  onChoose,
}: {
  card: ConflictCard;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  error: string | null;
  onChoose: (action: CardAction) => void;
}) {
  const label = [
    card.match ?? (card.form_kind === 'super' ? 'Super' : null),
    card.team ? `${card.team.number} ${card.team.name}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <article
      aria-label={label}
      data-conflict={card.id}
      className="grid overflow-hidden rounded-card border border-line bg-surface [grid-template-areas:'head'_'diff'_'acts'] lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'head_diff'_'acts_diff']"
    >
      <div className="[grid-area:head] lg:border-e lg:border-line-2">
        <CardHead card={card} expanded={expanded} />
      </div>
      <div className="min-w-0 [grid-area:diff]">
        <ConflictDiff card={card} expanded={expanded} onToggle={onToggle} />
      </div>
      <div className="flex flex-col gap-2 px-3 pt-2.5 pb-3 [grid-area:acts] lg:border-e lg:border-line-2 lg:px-4 lg:pt-1">
        {error && <ErrorLine className="text-[0.8125rem]">{error}</ErrorLine>}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {card.actions.map((action) => (
            <Button
              key={action.label}
              variant={action.primary ? 'primary' : 'secondary'}
              disabled={disabled}
              onClick={() => onChoose(action)}
              className="min-w-0 px-2 text-[0.84375rem] lg:min-h-[46px] lg:text-[0.875rem]"
            >
              <span className="truncate">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </article>
  );
}

/**
 * THEME "Settled line (Undo)": the card folded by a choice — "✓ Kept Dana’s copy · Q12 2096",
 * Undo and the seconds left in a 2 px ring. The number ticks; nothing else moves, so reduced
 * motion sees the same still countdown. While it is being sent, "Sending…" replaces Undo.
 */
function SettledFold({
  card,
  action,
  seconds,
  sending,
  onUndo,
}: {
  card: ConflictCard;
  action: CardAction;
  seconds: number;
  sending: boolean;
  onUndo: () => void;
}) {
  return (
    <div
      data-conflict={card.id}
      className="flex min-h-[46px] items-center gap-2.5 rounded-card border border-accent/30 bg-accent-tint px-3 py-2 text-[0.8125rem] lg:px-4 lg:text-[0.9375rem]"
    >
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-on-accent"
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      <span role="status" className="min-w-0 flex-1 text-ink">
        <b className="font-[650] text-accent-ink">{action.done}</b> · {card.short}
      </span>
      {sending ? (
        <span className="shrink-0 font-semibold text-accent-ink">Sending…</span>
      ) : (
        <button
          type="button"
          onClick={onUndo}
          aria-label={`Undo, ${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`}
          className="tap-target -me-1 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-control px-1 font-bold text-accent-ink hover:underline"
        >
          Undo
          <span
            aria-hidden="true"
            className="num grid size-5 place-items-center rounded-full border-2 border-accent text-[0.6875rem] font-semibold"
          >
            {seconds}
          </span>
        </button>
      )}
    </div>
  );
}

/** THEME "Settled log": today's settled conflicts on this event, newest first. */
function SettledToday({ lines }: { lines: SettledLine[] }) {
  return (
    <section aria-labelledby="settled-today" className="flex flex-col gap-2 lg:max-w-2xl">
      <h2
        id="settled-today"
        className="px-0.5 pt-1 text-xs font-bold tracking-[0.05em] text-muted uppercase"
      >
        Settled today
      </h2>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex items-center gap-2 border-b border-line-2 px-3 py-2.5 text-[0.78125rem] text-ink-2 last:border-b-0 lg:text-[0.84375rem]"
          >
            <Check
              aria-hidden="true"
              className="size-3.5 shrink-0 text-accent-ink"
              strokeWidth={2.6}
            />
            <span dir="auto" className="min-w-0 flex-1">
              <b className="font-[650] text-ink">{line.title}</b> {line.what}
            </span>
            <span className="num shrink-0 whitespace-nowrap text-muted">
              {line.time}
              {line.by && ` · ${line.by}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
