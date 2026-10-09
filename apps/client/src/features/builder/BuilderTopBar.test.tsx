import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FORM_ID, formOut, V, versionOut, VERSIONS } from '@/test/formFixtures';
import { BuilderTopBar } from './BuilderTopBar';

/** The active, locked v3 while draft v4 exists, with an unsaved structural change. */
function renderBar(belongsIn: number | null) {
  const v3 = VERSIONS.find((v) => v.id === V.v3)!;
  render(
    <MemoryRouter>
      <BuilderTopBar
        form={formOut()}
        version={versionOut(v3)}
        year={2026}
        editable
        online
        busy={null}
        dirty
        changeLine={null}
        forkLine={null}
        belongsIn={belongsIn}
        savedAt={v3.updated_at}
        held={null}
        onSave={vi.fn()}
        onPublish={vi.fn()}
        onRestore={vi.fn()}
        onOpenVersion={vi.fn()}
        onNextIncomplete={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('BuilderTopBar: a structural change on the active version while a draft exists (task 1.29)', () => {
  it('holds Save changes and links to the draft the change belongs in', () => {
    renderBar(4);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByText('This change belongs in draft v4 ·')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open draft v4' })).toHaveAttribute(
      'href',
      `/admin/forms/${FORM_ID}?version=4`,
    );
  });

  it('an in-place change saves as usual', () => {
    renderBar(null);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(screen.queryByText(/belongs in draft/)).toBeNull();
  });
});
