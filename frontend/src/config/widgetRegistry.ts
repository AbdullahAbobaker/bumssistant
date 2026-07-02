export type WidgetType = 
  | 'STAT_CARD'
  | 'TASK_LIST'
  | 'PROGRESS'
  | 'PROFILE'
  | 'CHAT'
  | 'CALENDAR'
  | 'ACCORDION_LIST';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  region?: 'main' | 'aside';
  w?: number;
  h?: number;
}

export const WIDGET_DEFAULT_SIZES: Record<WidgetType, { w: number; h: number }> = {
  STAT_CARD: { w: 1, h: 1 },
  TASK_LIST: { w: 1, h: 2 },
  PROGRESS: { w: 1, h: 1 },
  PROFILE: { w: 1, h: 1 },
  CHAT: { w: 2, h: 2 },
  CALENDAR: { w: 1, h: 2 },
  ACCORDION_LIST: { w: 1, h: 2 },
};
