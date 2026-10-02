import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppBadge } from './AppBadge';
import { AppButton } from './AppButton';
import { AppControlLabel } from './AppControlLabel';
import { AppInput } from './AppInput';
import { uiTypography } from './tokens';

describe('readable type scale', () => {
  it('uses 14px semibold labels and 14px control values', () => {
    expect(uiTypography.controlLabel).toContain('text-sm');
    expect(uiTypography.controlLabel).not.toContain('text-xs');
    expect(uiTypography.controlLabel).toContain('font-semibold');
    expect(uiTypography.controlLabel).toContain('text-gray-700');
    expect(uiTypography.controlValue).toContain('text-sm');
    expect(uiTypography.overline).toContain('text-sm');
    expect(uiTypography.overline).toContain('font-semibold');

    render(
      <label>
        <AppControlLabel label="Project name *" />
        <AppInput aria-label="Project name" placeholder="Type here" />
      </label>,
    );

    expect(screen.getByText('Project name').className).toContain('text-sm');
    expect(screen.getByText('Project name').className).not.toContain('uppercase');
    expect(screen.getByLabelText('Project name').className).toContain('text-sm');
    expect(screen.getByLabelText('Project name').className).toContain('placeholder:text-gray-400');
  });

  it('keeps badges and default buttons off the 10px uppercase caption size', () => {
    render(
      <>
        <AppBadge>Open</AppBadge>
        <AppButton>Save</AppButton>
      </>,
    );
    expect(screen.getByText('Open').className).toContain('text-sm');
    expect(screen.getByText('Open').className).not.toContain('uppercase');
    expect(screen.getByText('Open').className).not.toContain('text-[10px]');
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('text-sm');
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('font-semibold');
  });
});
