import { DynamicStatWidgetProps } from '../components/widgets/DynamicStatWidget'
import { DynamicListWidgetProps } from '../components/widgets/DynamicListWidget'
import { CalendarWidgetProps } from '../components/widgets/CalendarWidget'
import { TaskWidgetProps } from '../components/widgets/TaskWidget'

export type WidgetType = 
  | 'STAT_CARD'
  | 'TASK_LIST'
  | 'PROGRESS'
  | 'PROFILE'
  | 'CHAT'
  | 'CALENDAR'
  | 'ACCORDION_LIST';

interface BaseWidgetConfig {
  id: string;
  region?: 'main' | 'aside';
  w?: number;
  h?: number;
}

export type WidgetConfig =
  | (BaseWidgetConfig & { type: 'STAT_CARD'; props: DynamicStatWidgetProps })
  | (BaseWidgetConfig & { type: 'TASK_LIST'; props?: TaskWidgetProps })
  | (BaseWidgetConfig & { type: 'PROGRESS'; props?: Record<string, any> }) // Default generic props if needed
  | (BaseWidgetConfig & { type: 'PROFILE'; props?: Record<string, any> })
  | (BaseWidgetConfig & { type: 'CHAT'; props?: Record<string, any> })
  | (BaseWidgetConfig & { type: 'CALENDAR'; props?: CalendarWidgetProps })
  | (BaseWidgetConfig & { type: 'ACCORDION_LIST'; props: DynamicListWidgetProps });


export const WIDGET_DEFAULT_SIZES: Record<WidgetType, { w: number; h: number }> = {
  STAT_CARD: { w: 1, h: 1 },
  TASK_LIST: { w: 1, h: 2 },
  PROGRESS: { w: 1, h: 1 },
  PROFILE: { w: 1, h: 1 },
  CHAT: { w: 2, h: 2 },
  CALENDAR: { w: 1, h: 2 },
  ACCORDION_LIST: { w: 1, h: 2 },
};
