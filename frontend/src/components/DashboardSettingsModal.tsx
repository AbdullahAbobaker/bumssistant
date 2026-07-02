import { useState } from 'react';
import type { WidgetConfig } from '../config/widgetRegistry';
import { AVAILABLE_WIDGETS } from '../config/widgetRegistry';
import './DashboardSettingsModal.css';

interface DashboardSettingsModalProps {
  userDashboardConfig: WidgetConfig[];
  onSave: (newConfig: WidgetConfig[]) => void;
  onClose: () => void;
}

export function DashboardSettingsModal({ userDashboardConfig, onSave, onClose }: DashboardSettingsModalProps) {
  // Maintain a map of widget type to its configuration, preserving original state
  const [widgetConfigs, setWidgetConfigs] = useState<Record<string, WidgetConfig>>(() => {
    const configs: Record<string, WidgetConfig> = {};
    
    // First, populate with defaults
    AVAILABLE_WIDGETS.forEach(wInfo => {
      configs[wInfo.type] = {
        id: `${wInfo.type.toLowerCase()}-${Date.now()}`,
        type: wInfo.type,
        region: wInfo.type === 'CHAT' ? 'main' : 'aside',
        props: wInfo.defaultProps || {}
      } as WidgetConfig;
    });

    // Then override with existing user config to preserve state & ids
    userDashboardConfig.forEach(w => {
      configs[w.type] = { ...w };
    });

    return configs;
  });

  const [activeTypes, setActiveTypes] = useState<Set<string>>(() => {
    return new Set(userDashboardConfig.map(w => w.type));
  });

  const handleToggle = (type: string) => {
    const newSet = new Set(activeTypes);
    if (newSet.has(type)) {
      newSet.delete(type);
    } else {
      newSet.add(type);
    }
    setActiveTypes(newSet);
  };

  const updateWidgetProp = (type: string, propKey: string, value: string) => {
    setWidgetConfigs(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        props: {
          ...prev[type].props,
          [propKey]: value
        }
      }
    }));
  };

  const handleSave = () => {
    // Preserve the order of AVAILABLE_WIDGETS or original config.
    // Let's preserve the order of AVAILABLE_WIDGETS for simplicity, 
    // or just filter the active ones.
    const newConfig = AVAILABLE_WIDGETS
      .filter(wInfo => activeTypes.has(wInfo.type))
      .map(wInfo => widgetConfigs[wInfo.type]);
      
    onSave(newConfig);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-3">
        <div className="modal-header">
          <h2 className="text-heading-large">Dashboard bearbeiten</h2>
          <p className="text-body">Wähle die Widgets und passe ihre Einstellungen an.</p>
        </div>
        
        <div className="widget-list">
          <h3 className="text-label text-muted">Verfügbare Widgets</h3>
          {AVAILABLE_WIDGETS.map(widgetInfo => {
            const isSelected = activeTypes.has(widgetInfo.type);
            const config = widgetConfigs[widgetInfo.type];
            
            return (
              <div key={widgetInfo.type} className={`widget-toggle-group glass-1 ${isSelected ? 'selected' : ''}`}>
                <label className="widget-toggle-item">
                  <span className="text-heading-medium">{widgetInfo.label}</span>
                  <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={() => handleToggle(widgetInfo.type)}
                    className="widget-checkbox"
                  />
                </label>
                
                {isSelected && (widgetInfo.type === 'STAT_CARD' || widgetInfo.type === 'ACCORDION_LIST') && (
                  <div className="widget-settings">
                    {widgetInfo.type === 'STAT_CARD' && (
                      <>
                        <input 
                          type="text" 
                          className="settings-input"
                          value={config.props?.title || ''} 
                          onChange={(e) => updateWidgetProp(widgetInfo.type, 'title', e.target.value)} 
                          placeholder="Titel" 
                          aria-label={`${widgetInfo.label} Titel`}
                        />
                        <input 
                          type="text" 
                          className="settings-input"
                          value={config.props?.value || ''} 
                          onChange={(e) => updateWidgetProp(widgetInfo.type, 'value', e.target.value)} 
                          placeholder="Wert" 
                          aria-label={`${widgetInfo.label} Wert`}
                        />
                      </>
                    )}
                    {widgetInfo.type === 'ACCORDION_LIST' && (
                      <>
                        <input 
                          type="text" 
                          className="settings-input"
                          value={config.props?.title || ''} 
                          onChange={(e) => updateWidgetProp(widgetInfo.type, 'title', e.target.value)} 
                          placeholder="Listen Titel" 
                          aria-label={`${widgetInfo.label} Titel`}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary glass-2" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSave}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
