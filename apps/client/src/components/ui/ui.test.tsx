import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonVariants } from './button';
import { Card, CardTitle } from './card';
import { Input } from './input';
import { SearchField } from './search-field';
import { Select } from './select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

const sources = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('design-system primitives (SPEC-FINAL 17.4, 17.7)', () => {
  it('never hard-codes a colour: no hex anywhere in components/ui', () => {
    const files = Object.entries(sources).filter(([path]) => !path.endsWith('.test.tsx'));
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const [path, source] of files) expect(source, path).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('puts every button variant and size on the 48 px floor', () => {
    for (const variant of ['primary', 'secondary', 'destructive', 'ghost'] as const) {
      for (const size of ['sm', 'md', 'lg', 'icon', 'block'] as const) {
        expect(buttonVariants({ variant, size }).split(' ')).toContain('tap-target');
      }
    }
  });

  it('grows the 36 px and 44 px buttons to 48 px with an ::after inset', () => {
    const sm = buttonVariants({ size: 'sm' }).split(' ');
    expect(sm).toEqual(expect.arrayContaining(['min-h-9', 'after:absolute', 'after:-inset-y-1.5']));
    const md = buttonVariants({ size: 'md' }).split(' ');
    expect(md).toEqual(
      expect.arrayContaining(['min-h-11', 'after:absolute', 'after:-inset-y-0.5']),
    );
  });

  it('keeps an inline link button on the floor through its ::after, with no box of its own', () => {
    const link = buttonVariants({ variant: 'link', size: 'inline' }).split(' ');
    expect(link).toEqual(
      expect.arrayContaining(['tap-target', 'min-h-0', 'after:absolute', 'after:-inset-y-3.5']),
    );
    expect(link).toContain('text-accent-ink');
  });

  it('defaults a Button to type="button", never an accidental submit', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('keeps inputs and selects native, on the floor, with 16 px text (no iOS zoom)', () => {
    render(
      <>
        <Input aria-label="Name" />
        <SearchField value="" onChange={() => {}} placeholder="Search" label="Search" />
        <Select aria-label="Season">
          <option>2026</option>
        </Select>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveClass('tap-target', 'text-base');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveClass(
      'tap-target',
      'text-base',
    );
    const select = screen.getByRole('combobox', { name: 'Season' });
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveClass('tap-target', 'text-base');
  });

  it('end-aligns numeric table cells in mono figures, and scopes headers', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead numeric>Match</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell numeric>12</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const header = screen.getByRole('columnheader', { name: 'Match' });
    expect(header).toHaveClass('text-end');
    expect(header).toHaveAttribute('scope', 'col');
    expect(screen.getByRole('cell', { name: '12' })).toHaveClass('text-end', 'num');
  });

  it('renders a card as a labelled section with its heading at the level asked', () => {
    render(
      <Card as="section" aria-labelledby="t">
        <CardTitle id="t" level={3}>
          Role
        </CardTitle>
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Role' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Role' })).toBeInTheDocument();
  });
});
