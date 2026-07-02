import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DashboardSettingsModal } from './DashboardSettingsModal';
import { WidgetConfig } from '../config/widgetRegistry';

describe('DashboardSettingsModal', () => {
  it('retains original props and ID when toggled off and back on', () => {
    const mockOnSave = vi.fn();
    const initialConfig: WidgetConfig[] = [
      { id: 'stat1', type: 'STAT_CARD', region: 'aside', props: { title: 'Test Title', value: '1', color: 'red' } }
    ];

    render(
      <DashboardSettingsModal 
        userDashboardConfig={initialConfig} 
        onSave={mockOnSave} 
        onClose={vi.fn()} 
      />
    );

    // Find checkboxes
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const statCheckbox = checkboxes[0]; // First widget in AVAILABLE_WIDGETS is STAT_CARD
    
    // Uncheck STAT_CARD
    fireEvent.click(statCheckbox);
    expect(statCheckbox.checked).toBe(false);

    // Check STAT_CARD again
    fireEvent.click(statCheckbox);
    expect(statCheckbox.checked).toBe(true);

    // Save
    const saveButton = screen.getByText('Speichern');
    fireEvent.click(saveButton);

    const newConfig = mockOnSave.mock.calls[0][0];
    const statWidget = newConfig.find((w: WidgetConfig) => w.type === 'STAT_CARD');
    
    expect(statWidget).toBeDefined();
    expect(statWidget.id).toBe('stat1');
    expect(statWidget.props.title).toBe('Test Title');
  });

  it('allows modifying widget specific settings', () => {
    const mockOnSave = vi.fn();
    const initialConfig: WidgetConfig[] = [
      { id: 'stat1', type: 'STAT_CARD', region: 'aside', props: { title: 'Test Title', value: '1', color: 'red' } }
    ];

    render(
      <DashboardSettingsModal 
        userDashboardConfig={initialConfig} 
        onSave={mockOnSave} 
        onClose={vi.fn()} 
      />
    );

    // Settings inputs should be visible because it's selected
    const titleInput = screen.getByPlaceholderText('Titel') as HTMLInputElement;
    expect(titleInput.value).toBe('Test Title');

    // Change title
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    expect(titleInput.value).toBe('New Title');

    // Save
    const saveButton = screen.getByText('Speichern');
    fireEvent.click(saveButton);

    const newConfig = mockOnSave.mock.calls[0][0];
    const statWidget = newConfig.find((w: WidgetConfig) => w.type === 'STAT_CARD');
    
    expect(statWidget.props.title).toBe('New Title');
  });

  it('triggers onClose when Abbrechen is clicked', () => {
    const mockOnSave = vi.fn();
    const mockOnClose = vi.fn();

    render(
      <DashboardSettingsModal 
        userDashboardConfig={[]} 
        onSave={mockOnSave} 
        onClose={mockOnClose} 
      />
    );

    const cancelButton = screen.getByText('Abbrechen');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnSave).not.toHaveBeenCalled();
  });
});
