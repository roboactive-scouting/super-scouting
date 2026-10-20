import {
  ChevronRight,
  Monitor,
  Smartphone,
  Sun,
  Type,
  Vibrate,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useId, useState, type ReactNode } from 'react';
import type { FormFieldDefinition } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { roleLabel } from '@/components/ui/tag';
import { clientConfig } from '@/config';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { useEventName } from '@/features/context/useEventName';
import { FieldInput } from '@/features/entry/FieldInput';
import { useShellContext } from '@/features/shell/shellContext';
import { keepScreenOn, useBoolPref, vibrateOnTap } from '@/lib/devicePrefs';
import { canVibrate } from '@/lib/haptics';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import {
  scaleLabel,
  TEXT_SCALES,
  textScale,
  theme,
  useTextScale,
  useTheme,
  type TextScale,
  type ThemeId,
} from './theme';
import { holdParts, isHeld, readWipeHold, type WipeHold } from './wipeHold';

/** The wipe's confirmation and its code (task 1.49): loaded when it opens, never up front. */
const DeviceWipe = lazy(() => import('./DeviceWipe').then((m) => ({ default: m.DeviceWipe })));

const THEME_NAME: Record<ThemeId, string> = { light: 'Light', outdoor: 'Outdoor' };
const THEME_LINE: Record<ThemeId, string> = {
  light: 'The everyday look',
  outdoor: 'Black on white, stronger colours, for sunlight',
};

/** One row's box (16-settings `.st-li`): 56 px, a `--line-2` rule between rows. */
const ROW = 'flex min-h-14 items-center gap-3 border-b border-line-2 px-3.5 py-2 last:border-b-0';

/** The 32 px icon tile at a row's start. */
function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-control bg-line-2 text-ink-2"
    >
      <Icon className="size-[1.0625rem]" strokeWidth={2} />
    </span>
  );
}

/** A row's name, 14.5 px / 600, and its quiet line under it. */
function RowText({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <span className="block min-w-0 flex-1 text-start">
      <span className="block text-[0.90625rem] font-semibold text-ink [overflow-wrap:anywhere]">
        {title}
      </span>
      {sub && (
        <span className="block text-xs leading-snug font-normal text-muted [overflow-wrap:anywhere]">
          {sub}
        </span>
      )}
    </span>
  );
}

/** A group: its small uppercase label, then its rows in one card. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="px-0.5 pb-2 text-xs font-bold tracking-[0.05em] text-muted uppercase">
        {label}
      </h2>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">{children}</ul>
    </section>
  );
}

/** A row that opens its choice: the name, the value now in force, and a ›. */
function OpenRow({
  icon,
  title,
  sub,
  value,
  onOpen,
}: {
  icon: LucideIcon;
  title: string;
  sub?: ReactNode;
  value?: string;
  onOpen: () => void;
}) {
  return (
    <li className="border-b border-line-2 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          ROW,
          'hover-veil motion-safe:transition w-full border-b-0 focus-visible:outline-offset-[-2px]',
        )}
      >
        <RowIcon icon={icon} />
        <RowText title={title} sub={sub} />
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
          {value}
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      </button>
    </li>
  );
}

/** A setting that is on or off: it saves the moment it is switched, with no Save button. */
function SwitchRow({
  icon,
  title,
  sub,
  checked,
  disabled,
  onChange,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <li className={cn(ROW, 'py-0')}>
      <RowIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <Switch
          label={<RowText title={title} sub={sub} />}
          checked={checked}
          disabled={disabled}
          dimLabel={false}
          onChange={onChange}
        />
      </div>
    </li>
  );
}

const EXAMPLE_BASE = {
  help_text: null,
  section: null,
  required: false,
  default_value: null,
  visibility_condition: null,
  deprecated: false,
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
} as const;

/** The live example's two fields: a real counter and real option buttons, as on an entry. */
const EXAMPLE_FIELDS: FormFieldDefinition[] = [
  {
    ...EXAMPLE_BASE,
    id: 'example-counter',
    key: 'example_pieces_high',
    label: 'Pieces scored high',
    help_text: 'Upper goal',
    type: 'counter',
    display_order: 1,
    config: {},
    description: 'An example',
    unit: 'count',
    phase: 'teleop',
    direction: 'higher_is_better',
  },
  {
    ...EXAMPLE_BASE,
    id: 'example-climb',
    key: 'example_climb',
    label: 'Climb level',
    type: 'single_select',
    display_order: 2,
    config: {
      options: [
        { value: 'none', label: 'None' },
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' },
      ],
    },
    description: 'An example',
    unit: 'enum',
    phase: 'endgame',
    direction: 'higher_is_better',
    is_ordinal: true,
  },
];

/**
 * The live example (16-settings final): the entry's own controls (`FieldInput`), drawn in the
 * theme and at the size in force — picking a theme or a size changes the whole app, this too.
 * Tapping it works and saves nothing.
 */
function LiveExample() {
  const [values, setValues] = useState<Record<string, unknown>>({
    example_pieces_high: 4,
    example_climb: 'high',
  });
  return (
    <section
      aria-label="Example"
      className="relative rounded-card border border-line bg-bg px-3.5 pt-5 pb-1"
    >
      <span
        aria-hidden="true"
        className="absolute end-2.5 top-2 text-[0.65625rem] font-extrabold tracking-[0.06em] text-muted"
      >
        PREVIEW
      </span>
      {/* Its own box, so the first row has no rule above it, as in an entry's phase. */}
      <div>
        {EXAMPLE_FIELDS.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(value) => setValues((v) => ({ ...v, [field.key]: value }))}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * A small picture of the app in one theme: the top bar, two lines of text, the alliances and a
 * button. `data-theme` re-scopes the tokens, so the Light tile stays light inside an Outdoor app.
 */
function ThemePicture({ id }: { id: ThemeId }) {
  return (
    <span
      aria-hidden="true"
      data-theme={id}
      className="flex h-[4.875rem] flex-col overflow-hidden rounded-control border border-line"
    >
      <span className="h-4 shrink-0 bg-rail" />
      <span className="flex flex-1 flex-col gap-1 bg-bg p-1.5">
        <span className="h-1.5 w-3/5 rounded-full bg-ink" />
        <span className="h-[5px] w-4/5 rounded-full bg-muted" />
        <span className="flex gap-[3px]">
          <span className="h-2 flex-1 rounded-[2px] bg-alliance-red" />
          <span className="h-2 flex-1 rounded-[2px] bg-alliance-blue" />
        </span>
        <span className="mt-auto h-3 rounded-[4px] bg-accent" />
      </span>
    </span>
  );
}

/** Light and Outdoor as picture tiles with a radio; the picked one is ringed. */
function ThemeTiles({ value, onPick }: { value: ThemeId; onPick: (id: ThemeId) => void }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2.5">
      {theme.options.map((id) => {
        const on = id === value;
        return (
          <label
            key={id}
            className={cn(
              'hover-veil motion-safe:transition flex cursor-pointer flex-col gap-2 rounded-xl border bg-surface p-2',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
              on ? 'border-2 border-accent bg-accent-tint p-[7px]' : 'border-control-border',
            )}
          >
            <input
              type="radio"
              name={name}
              value={id}
              checked={on}
              onChange={() => onPick(id)}
              className="sr-only"
            />
            <ThemePicture id={id} />
            <span className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 size-[18px] shrink-0 rounded-full bg-surface',
                  on ? 'border-[5px] border-accent' : 'border-2 border-control-border',
                )}
              />
              <span className="min-w-0">
                <span className="block text-sm font-[650] text-ink">{THEME_NAME[id]}</span>
                <span className="block text-[0.71875rem] leading-snug text-muted">
                  {THEME_LINE[id]}
                </span>
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * The four steps, each an "Aa" at its own size. The "Aa" is sized against the phone's own text
 * size (it divides out the step in force), so the four always compare as they would apply.
 */
function TextSteps({ value, onPick }: { value: TextScale; onPick: (s: TextScale) => void }) {
  return (
    <Segmented
      label="Text size"
      value={String(value)}
      onChange={(key) => onPick(Number(key) as TextScale)}
      options={TEXT_SCALES.map((step) => ({
        key: String(step),
        label: scaleLabel(step),
        content: (
          <span className="flex flex-col items-center py-1 leading-none">
            <b
              className="font-bold"
              style={{ fontSize: `calc(0.875rem * ${step} / var(--text-scale, 1))` }}
            >
              Aa
            </b>
            <small className="num mt-0.5 text-[0.6875rem] font-medium">{scaleLabel(step)}</small>
          </span>
        ),
      }))}
    />
  );
}

type Open = 'theme' | 'size' | 'wipe' | null;

/**
 * Settings (`/settings`; SPEC-FINAL 8.6, 17.4, 17.7, 17.9; 16-settings final, variant C): this
 * device's own look and comfort, as rows with their values. Theme and Text size open a sheet on a
 * phone and a dialog on a computer, each with a live example; the switches save at once. "This
 * device" names who is signed in, the competition and the version, and holds Wipe this device,
 * which shows as held while anything would be lost; its confirmation (`DeviceWipe`, task 1.49)
 * asks for the lead's code and the typed phrase.
 */
export function SettingsPage() {
  const { user, eventId } = useShellContext();
  const eventName = useEventName(eventId);
  const desktop = useIsDesktop();
  const themeId = useTheme();
  const scale = useTextScale();
  const screenOn = useBoolPref(keepScreenOn);
  const vibrate = useBoolPref(vibrateOnTap);
  const vibrates = canVibrate();
  const hold = useDeviceQuery<WipeHold>(readWipeHold, [], ['outbox']);
  const held = hold !== undefined && isHeld(hold);
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const version = clientConfig().appVersion;

  const done = (
    <Button variant="primary" onClick={close} className="max-lg:w-full">
      Done
    </Button>
  );

  return (
    <main className="flex w-full max-w-[48.75rem] flex-col gap-3.5 px-4 pt-3.5 pb-8 lg:px-8 lg:pt-6">
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight lg:text-[1.625rem]">Settings</h1>
        <p className="mt-0.5 text-[0.8125rem] text-muted lg:text-[0.875rem]">
          For this device only. Nothing here changes other phones.
        </p>
      </header>

      <Group label="Look">
        <OpenRow
          icon={Sun}
          title="Theme"
          value={THEME_NAME[themeId]}
          onOpen={() => setOpen('theme')}
        />
        <OpenRow
          icon={Type}
          title="Text size"
          value={scaleLabel(scale)}
          onOpen={() => setOpen('size')}
        />
      </Group>

      <Group label="During a match">
        <SwitchRow
          icon={Smartphone}
          title="Keep the screen on"
          sub="while an entry is open"
          checked={screenOn}
          onChange={keepScreenOn.set}
        />
        <SwitchRow
          icon={Vibrate}
          title="Vibrate on taps"
          sub={vibrates ? 'a short buzz on each tap' : 'this phone can’t vibrate'}
          checked={vibrates && vibrate}
          disabled={!vibrates}
          onChange={vibrateOnTap.set}
        />
      </Group>

      <Group label="This device">
        <li className={ROW}>
          <RowIcon icon={Monitor} />
          <RowText
            title={
              <span dir="auto">
                {user.full_name} · {roleLabel(user.role)}
              </span>
            }
            sub={
              <>
                {eventName && <span dir="auto">{eventName} · </span>}
                version <span className="num">{version}</span>
              </>
            }
          />
        </li>
        <OpenRow
          icon={Monitor}
          title="Wipe this device"
          sub={
            held ? `held: ${holdParts(hold).join(', ')}` : 'removes everything this app keeps here'
          }
          onOpen={() => setOpen('wipe')}
        />
      </Group>

      <ResponsiveDialog
        open={open === 'theme'}
        title="Theme"
        onClose={close}
        width={560}
        footer={done}
      >
        <LiveExample />
        <ThemeTiles value={themeId} onPick={(id) => void theme.set(id)} />
      </ResponsiveDialog>

      <ResponsiveDialog
        open={open === 'size'}
        title="Text size"
        onClose={close}
        width={720}
        footer={done}
      >
        <p className="-mt-1.5 text-[0.8125rem] text-muted">
          On top of your {desktop ? 'system’s' : 'phone’s'} own text size.
        </p>
        <LiveExample />
        <TextSteps value={scale} onPick={(s) => void textScale.set(s)} />
      </ResponsiveDialog>

      {open === 'wipe' && (
        <Suspense fallback={null}>
          <DeviceWipe onClose={close} />
        </Suspense>
      )}
    </main>
  );
}
