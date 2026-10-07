import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogOut } from 'lucide-react';
import { ActionBar } from './action-bar';
import { Counter } from './counter';
import { DescribedChoice } from './described-choice';
import { DestructiveConfirm, type DestructiveConfirmProps } from './destructive-confirm';
import { Dialog } from './dialog';
import { LiveChecks } from './live-checks';
import { OptionButtons } from './option-buttons';
import { ResponsiveDialog } from './responsive-dialog';
import { Segmented } from './segmented';
import { SuggestInput } from './suggest-input';
import { Switch } from './switch';

const ROLES = [
  { key: 'scouter', label: 'Scouter', description: 'Enters match data' },
  { key: 'lead', label: 'Scout lead', description: 'Fixes any entry, pick list' },
  { key: 'admin', label: 'Admin', description: 'Everything, incl. users' },
] as const;

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

/** jsdom has no matchMedia, so the hook answers "desktop"; this makes it answer "phone". */
function phone() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

describe('primitives II', () => {
  it('destructive confirm focuses Cancel first and names the object', () => {
    render(
      <DestructiveConfirm
        open
        title="Disable this account?"
        objectName="Yael Shapira"
        body="Not a delete."
        confirmLabel="Disable Yael Shapira"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Disable this account?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('destructive confirm shows Ban on the confirm button, another icon, or none', () => {
    const confirmIcon = (icon?: DestructiveConfirmProps['icon']) => {
      const { unmount } = render(
        <DestructiveConfirm
          open
          title="Delete this match?"
          objectName="Q10"
          body="Gone."
          confirmLabel="Delete"
          {...(icon === undefined ? {} : { icon })}
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
      const svg = screen.getByRole('button', { name: 'Delete' }).querySelector('svg');
      const name = svg ? svg.getAttribute('class') : null;
      unmount();
      return name;
    };
    expect(confirmIcon()).toContain('lucide-ban');
    expect(confirmIcon(LogOut)).toContain('lucide-log-out');
    expect(confirmIcon(null)).toBeNull();
  });

  it('Escape cancels a destructive confirm', async () => {
    const onCancel = vi.fn();
    render(
      <DestructiveConfirm
        open
        title="Delete?"
        objectName="Q10"
        body="x"
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('a busy destructive confirm holds Escape, and shows its error inside', async () => {
    const onCancel = vi.fn();
    render(
      <DestructiveConfirm
        open
        busy
        error="The server said no."
        title="Delete?"
        objectName="Q10"
        body="x"
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('The server said no.');
  });

  it('is a bottom sheet on a phone, with the same content', () => {
    phone();
    render(
      <DestructiveConfirm
        open
        title="Delete?"
        objectName="Q10"
        body="Gone for good."
        confirmLabel="Delete Q10"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete?' });
    expect(dialog).toHaveAttribute('data-surface', 'sheet');
    expect(dialog).toHaveTextContent('Gone for good.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('a described choice shows Saving… and locks the others while saving', () => {
    render(
      <DescribedChoice
        label="Role"
        options={[...ROLES]}
        value="scouter"
        saving="lead"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: /Scout lead/ })).toHaveTextContent('Saving…');
    expect(screen.getByRole('radio', { name: /Admin/ })).toBeDisabled();
  });

  it('a busy destructive confirm keeps focus inside: aria-disabled, never disabled', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DestructiveConfirm
        open
        busy
        title="Delete?"
        objectName="Q10"
        body="x"
        confirmLabel="Delete Q10"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Delete Q10' });
    expect(cancel).toHaveAttribute('aria-disabled', 'true');
    expect(cancel).not.toBeDisabled();
    expect(cancel).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    fireEvent.click(confirm);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(cancel).toHaveFocus();
  });

  it('type-to-confirm holds the confirm button until the name is typed', async () => {
    const onConfirm = vi.fn();
    render(
      <DestructiveConfirm
        open
        title="Delete?"
        objectName="Season 2026"
        body="x"
        typeToConfirm="2026"
        confirmLabel="Delete season"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete season' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox'), '2026');
    expect(confirm).not.toHaveAttribute('aria-disabled');
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('a described choice picks one and says which is checked', async () => {
    const onChange = vi.fn();
    render(
      <DescribedChoice label="Role" options={[...ROLES]} value="scouter" onChange={onChange} />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Role' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Scouter/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Admin/ })).toHaveTextContent(
      'Everything, incl. users',
    );
    await userEvent.click(screen.getByRole('radio', { name: /Admin/ }));
    expect(onChange).toHaveBeenCalledWith('admin');
  });

  it('segmented control is a radio group', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Match type"
        value="qual"
        onChange={onChange}
        options={[
          { key: 'practice', label: 'Practice' },
          { key: 'qual', label: 'Qualification' },
        ]}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Match type' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Qualification' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Practice' }));
    expect(onChange).toHaveBeenCalledWith('practice');
  });

  describe('segmented keyboard', () => {
    const OPTIONS = [
      { key: 'practice', label: 'Practice' },
      { key: 'qual', label: 'Qualification' },
      { key: 'playoff', label: 'Playoff' },
    ] as const;

    it('roving tabindex: the chosen segment is tabbable, else the first', () => {
      const { rerender } = render(
        <Segmented label="Type" value="qual" onChange={() => {}} options={OPTIONS} />,
      );
      expect(screen.getByRole('radio', { name: 'Practice' })).toHaveAttribute('tabindex', '-1');
      expect(screen.getByRole('radio', { name: 'Qualification' })).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('radio', { name: 'Playoff' })).toHaveAttribute('tabindex', '-1');
      rerender(
        <Segmented label="Type" value={'none' as 'qual'} onChange={() => {}} options={OPTIONS} />,
      );
      expect(screen.getByRole('radio', { name: 'Practice' })).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('radio', { name: 'Qualification' })).toHaveAttribute(
        'tabindex',
        '-1',
      );
    });

    it('arrows move focus and choose, wrapping at both ends; Home and End jump', async () => {
      const onChange = vi.fn();
      render(<Segmented label="Type" value="qual" onChange={onChange} options={OPTIONS} />);
      const u = userEvent.setup();
      await u.tab();
      expect(screen.getByRole('radio', { name: 'Qualification' })).toHaveFocus();
      await u.keyboard('{ArrowRight}');
      expect(screen.getByRole('radio', { name: 'Playoff' })).toHaveFocus();
      expect(onChange).toHaveBeenLastCalledWith('playoff');
      await u.keyboard('{ArrowDown}');
      expect(screen.getByRole('radio', { name: 'Practice' })).toHaveFocus();
      expect(onChange).toHaveBeenLastCalledWith('practice');
      await u.keyboard('{ArrowLeft}');
      expect(screen.getByRole('radio', { name: 'Playoff' })).toHaveFocus();
      expect(onChange).toHaveBeenLastCalledWith('playoff');
      await u.keyboard('{ArrowUp}');
      expect(onChange).toHaveBeenLastCalledWith('qual');
      await u.keyboard('{Home}');
      expect(screen.getByRole('radio', { name: 'Practice' })).toHaveFocus();
      expect(onChange).toHaveBeenLastCalledWith('practice');
      await u.keyboard('{End}');
      expect(screen.getByRole('radio', { name: 'Playoff' })).toHaveFocus();
      expect(onChange).toHaveBeenLastCalledWith('playoff');
    });

    it('flips Left and Right inside a right-to-left page', async () => {
      const onChange = vi.fn();
      render(
        <div dir="rtl">
          <Segmented label="Type" value="qual" onChange={onChange} options={OPTIONS} />
        </div>,
      );
      const u = userEvent.setup();
      await u.tab();
      await u.keyboard('{ArrowLeft}');
      expect(screen.getByRole('radio', { name: 'Playoff' })).toHaveFocus();
      expect(onChange).toHaveBeenLastCalledWith('playoff');
      await u.keyboard('{ArrowRight}');
      expect(screen.getByRole('radio', { name: 'Qualification' })).toHaveFocus();
      expect(onChange).toHaveBeenLastCalledWith('qual');
    });
  });

  it('live checks say met / not met in words', () => {
    render(
      <LiveChecks
        checks={[
          { label: 'At least 8 characters', state: 'ok' },
          { label: 'Both new passwords match', state: 'no' },
          { label: 'Not the old one', state: 'idle' },
        ]}
      />,
    );
    const ok = screen.getByText('At least 8 characters').closest('li');
    const no = screen.getByText('Both new passwords match').closest('li');
    expect(ok).toHaveAttribute('data-state', 'ok');
    expect(ok).toHaveTextContent('At least 8 characters: met');
    expect(ok).not.toHaveTextContent(/not met/);
    expect(no).toHaveAttribute('data-state', 'no');
    expect(no).toHaveTextContent('Both new passwords match: not met');
    expect(screen.getByText('Not the old one').closest('li')).toHaveAttribute('data-state', 'idle');
    expect(screen.getByRole('list').closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  it('suggest input picks with the keyboard', async () => {
    const onPick = vi.fn();
    render(
      <SuggestInput
        label="Red 3"
        value="62"
        onChange={() => {}}
        inputMode="numeric"
        suggestions={[{ n: 6230, name: 'Team Koi' }]}
        render={(t) => `${t.n} ${t.name}`}
        onPick={onPick}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Red 3' }));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith({ n: 6230, name: 'Team Koi' });
  });

  it('suggest input offers a create row, closes on Escape and reopens on an arrow', async () => {
    const onPick = vi.fn();
    const onCreate = vi.fn();
    render(
      <SuggestInput
        label="Red 3"
        value="9999"
        onChange={() => {}}
        suggestions={[]}
        render={(t: string) => t}
        onPick={onPick}
        createRow={{ label: '+ New team 9999', onPick: onCreate }}
      />,
    );
    const u = userEvent.setup();
    await u.click(screen.getByRole('combobox', { name: 'Red 3' }));
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await u.keyboard('{ArrowDown}');
    await u.click(screen.getByRole('option', { name: '+ New team 9999' }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('suggest input: reopening with ArrowDown highlights the first row; aria-controls only while open', async () => {
    render(
      <SuggestInput
        label="Red 3"
        value="62"
        onChange={() => {}}
        suggestions={[
          { n: 6230, name: 'Team Koi' },
          { n: 6231, name: 'Other' },
        ]}
        render={(t) => `${t.n} ${t.name}`}
        onPick={() => {}}
      />,
    );
    const u = userEvent.setup();
    const input = screen.getByRole('combobox', { name: 'Red 3' });
    expect(input).not.toHaveAttribute('aria-controls');
    await u.click(input);
    expect(input).toHaveAttribute('aria-controls');
    await u.keyboard('{Escape}');
    expect(input).not.toHaveAttribute('aria-controls');
    await u.keyboard('{ArrowDown}');
    const first = screen.getByRole('option', { name: '6230 Team Koi' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first.className).toMatch(/min-h-12/);
  });

  it('suggest input picks once on a click, and on a click with no mousedown', async () => {
    const onPick = vi.fn();
    render(
      <SuggestInput
        label="Red 3"
        value="62"
        onChange={() => {}}
        suggestions={[{ n: 6230, name: 'Team Koi' }]}
        render={(t) => `${t.n} ${t.name}`}
        onPick={onPick}
      />,
    );
    const u = userEvent.setup();
    await u.click(screen.getByRole('combobox', { name: 'Red 3' }));
    await u.click(screen.getByRole('option', { name: '6230 Team Koi' }));
    expect(onPick).toHaveBeenCalledOnce();
    // A screen reader's activation sends only a click.
    await u.keyboard('{ArrowDown}');
    fireEvent.click(screen.getByRole('option', { name: '6230 Team Koi' }));
    expect(onPick).toHaveBeenCalledTimes(2);
  });
});

describe('Dialog', () => {
  it('is a labelled modal with a close button, and Escape closes it', async () => {
    const onClose = vi.fn();
    render(
      <Dialog
        open
        title="Add a user"
        onClose={onClose}
        footer={<button type="button">Save</button>}
      >
        <input aria-label="Name" />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Add a user' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} title="Add a user" onClose={() => {}}>
        x
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ResponsiveDialog', () => {
  it('is a centred dialog on a desktop and a bottom sheet on a phone', () => {
    const { unmount } = render(
      <ResponsiveDialog open title="Pick" onClose={() => {}}>
        <button type="button">One</button>
      </ResponsiveDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Pick' })).toHaveAttribute('data-surface', 'dialog');
    unmount();
    phone();
    render(
      <ResponsiveDialog open title="Pick" onClose={() => {}}>
        <button type="button">One</button>
      </ResponsiveDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Pick' })).toHaveAttribute('data-surface', 'sheet');
  });
});

describe('moved controls', () => {
  it('option buttons choose one', async () => {
    const onChange = vi.fn();
    render(
      <OptionButtons
        legend="Climb"
        value={null}
        onChange={onChange}
        options={[
          { value: 'none', label: 'None' },
          { value: 'deep', label: 'Deep' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Deep' }));
    expect(onChange).toHaveBeenCalledWith('deep');
  });

  it('a switch has role switch, named by its label, and aria-checked follows checked', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Switch label="Left the line" checked={false} onChange={onChange} />,
    );
    const control = screen.getByRole('switch', { name: 'Left the line' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Switch label="Left the line" checked onChange={onChange} />);
    expect(screen.getByRole('switch', { name: 'Left the line' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('a counter counts and never goes below its minimum', async () => {
    const onChange = vi.fn();
    render(<Counter label="Notes" value={0} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Notes minus one' }));
    expect(onChange).toHaveBeenCalledWith(0);
    await userEvent.click(screen.getByRole('button', { name: 'Notes plus one' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('an action bar holds its children', () => {
    render(
      <ActionBar>
        <button type="button">Send</button>
      </ActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('an action bar can stand in the page flow from a desktop width', () => {
    render(
      <ActionBar desktop="static">
        <button type="button">Send</button>
      </ActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Send' }).parentElement).toHaveClass('lg:static');
  });
});
