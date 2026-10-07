import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AllianceButtons } from './alliance-buttons';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { FilterChips } from './filter-chips';
import { GoToTile } from './goto-tile';
import { Handover } from './handover';
import { Initials } from './initials';
import { Input } from './input';
import { ErrorLine, Note, SuccessBanner, WarningNotice } from './notice';
import { PasswordInput } from './password-input';
import { SearchField } from './search-field';
import { Select } from './select';
import { StationPill } from './station-pill';
import { StatTile } from './stat-tile';
import { AccountStatusTag, AllianceTag, RobotStatusTag, RoleTag, StationTag } from './tag';

describe('primitives I', () => {
  it('a busy button is disabled and says its busy label', () => {
    render(
      <Button busy busyLabel="Signing in…">
        Sign in
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });
  it('the destructive button is filled ink, never red', () => {
    render(<Button variant="destructive">Disable</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-ink/);
    expect(screen.getByRole('button').className).not.toMatch(/red/);
  });
  it('the password eye shows and hides the text', async () => {
    render(
      <label>
        Password
        <PasswordInput defaultValue="secret12" />
      </label>,
    );
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('an error line is announced', () => {
    render(<ErrorLine>That username and password do not match.</ErrorLine>);
    expect(screen.getByRole('alert')).toHaveTextContent('do not match');
  });
  it('a note is not an alert', () => {
    render(<Note icon="offline">No connection.</Note>);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('status, role and station tags say their word, not only a colour', () => {
    render(
      <>
        <RobotStatusTag status="no_show" />
        <RoleTag role="lead" />
        <StationTag station="B2" />
      </>,
    );
    expect(screen.getByText('No show')).toBeInTheDocument();
    expect(screen.getByText('Scout lead')).toBeInTheDocument();
    expect(screen.getByText('Blue 2')).toBeInTheDocument();
  });
  it('filter chips are toggle buttons with counts', async () => {
    let value = 'all';
    const { rerender } = render(
      <FilterChips
        label="Filter"
        value={value}
        onChange={(k) => (value = k)}
        options={[
          { key: 'all', label: 'All', count: 14 },
          { key: 'mine', label: 'Mine', count: 4 },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'All 14' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Mine 4' }));
    expect(value).toBe('mine');
    rerender(
      <FilterChips
        label="Filter"
        value="mine"
        onChange={() => {}}
        options={[
          { key: 'all', label: 'All' },
          { key: 'mine', label: 'Mine' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('filter chips are 32 px pills on a phone and 34 px on desktop, both with a 48 px target', () => {
    render(
      <FilterChips
        label="Filter"
        value="all"
        onChange={() => {}}
        options={[{ key: 'all', label: 'All' }]}
      />,
    );
    const chip = screen.getByRole('button', { name: 'All' });
    expect(chip).toHaveClass(
      'min-h-8',
      'px-2.5',
      'text-[0.78125rem]',
      'lg:min-h-[34px]',
      'min-w-12',
      'after:absolute',
      'after:-inset-y-2',
      'lg:after:-inset-y-[7px]',
    );
  });
  it('the password eye has a 48 px hit area around its 40 px button', () => {
    render(<PasswordInput aria-label="Password" />);
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveClass(
      'size-10',
      'after:absolute',
      'after:-inset-1',
    );
  });
  it('initials take the first letters of up to two words', () => {
    render(<Initials name="Yael Shapira" />);
    expect(screen.getByText('YS')).toBeInTheDocument();
  });
});

describe('primitives I: the rest', () => {
  it('every button size keeps a 48 px target and no variant is red', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'destructive'] as const) {
      for (const size of ['sm', 'md', 'lg', 'block', 'icon'] as const) {
        const { unmount } = render(
          <Button variant={variant} size={size}>
            x
          </Button>,
        );
        const cls = screen.getByRole('button').className;
        expect(cls, `${variant}/${size}`).toContain('tap-target');
        expect(cls, `${variant}/${size}`).not.toMatch(/red/);
        unmount();
      }
    }
  });
  it('a button never submits by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
  it('the large input is 56 px and mono on request', () => {
    render(<Input aria-label="Match" size="lg" mono />);
    const el = screen.getByRole('textbox', { name: 'Match' });
    expect(el.className).toMatch(/min-h-14/);
    expect(el.className).toMatch(/font-num/);
  });
  it('the select is a native select', () => {
    render(
      <Select aria-label="Season">
        <option>2026</option>
      </Select>,
    );
    expect(screen.getByRole('combobox', { name: 'Season' }).tagName).toBe('SELECT');
  });
  it('the search field is a searchbox that reports what is typed', async () => {
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} placeholder="Search teams" label="Search" />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'q');
    expect(onChange).toHaveBeenCalledWith('q');
  });
  it('a warning notice carries its lead; a success banner its title', () => {
    render(
      <>
        <WarningNotice lead="Your sign-in expired.">Sign in again.</WarningNotice>
        <SuccessBanner title="Saved">All sent.</SuccessBanner>
      </>,
    );
    expect(screen.getByText('Your sign-in expired.')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('alliance and account tags say their word', () => {
    render(
      <>
        <AllianceTag alliance="red">Red</AllianceTag>
        <AccountStatusTag disabledAt={null} />
        <AccountStatusTag disabledAt="2026-03-04T10:00:00Z" />
      </>,
    );
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/^Disabled since /)).toBeInTheDocument();
  });
  it('an empty state has a title, a detail and its one action', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No entries yet"
        detail="Scout a match."
        action={<button type="button">Scout</button>}
      />,
    );
    expect(screen.getByText('No entries yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scout' })).toBeInTheDocument();
  });
  it('the handover shows the secret and its note', () => {
    render(
      <Handover
        title="Account created"
        secret="Tiger-4821"
        note="Shown once."
        actions={<button type="button">Copy</button>}
      />,
    );
    expect(screen.getByText('Tiger-4821')).toBeInTheDocument();
    expect(screen.getByText('Shown once.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });
  it('alliance buttons are a radio group', async () => {
    const onChange = vi.fn();
    render(<AllianceButtons value="red" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Red' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Blue' }));
    expect(onChange).toHaveBeenCalledWith('blue');
  });
  it('alliance buttons move and pick with the arrow keys, Home and End', async () => {
    const onChange = vi.fn();
    render(<AllianceButtons value="red" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Red' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute('tabindex', '-1');
    screen.getByRole('radio', { name: 'Red' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('blue');
    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('red');
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('blue');
    await userEvent.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('red');
  });
  it('with no side picked the first is the tab stop', () => {
    render(<AllianceButtons value={null} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Red' })).toHaveAttribute('tabindex', '0');
  });
  it('the handover shows an optional label before the secret', () => {
    const { rerender } = render(
      <Handover title="Created" label="Their password" secret="Tiger-4821" note="Shown once." />,
    );
    const label = screen.getByText('Their password');
    expect(label).toHaveClass('text-xs', 'font-semibold', 'text-muted');
    expect(
      label.compareDocumentPosition(screen.getByText('Tiger-4821')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    rerender(<Handover title="Created" secret="Tiger-4821" note="Shown once." />);
    expect(screen.queryByText('Their password')).not.toBeInTheDocument();
  });
  it('the handover is a status region', () => {
    render(<Handover title="Account created" secret="Tiger-4821" note="Shown once." />);
    expect(screen.getByRole('status')).toHaveTextContent('Tiger-4821');
  });
  it('a stat tile shows label, value and note', () => {
    render(<StatTile label="Waiting" value="3" note="to send" tone="warn" />);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('to send')).toBeInTheDocument();
  });
  it('a go-to tile is one link with its title and description', () => {
    render(
      <MemoryRouter>
        <GoToTile icon={Inbox} title="Entries" description="Everything scouted" to="/entries" />
        <GoToTile icon={Inbox} title="Manage" description="Events" to="/manage" admin />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Entries/ })).toHaveAttribute('href', '/entries');
    expect(screen.getByRole('link', { name: /Manage/ })).toHaveTextContent('ADMIN');
  });
  it('the station pill names the station', () => {
    render(<StationPill station="R3" />);
    expect(screen.getByText('Red 3')).toBeInTheDocument();
  });
});
