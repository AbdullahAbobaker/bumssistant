import './CalendarWidget.css'

export interface CalendarWidgetProps {
  month?: number; // 0-11
  year?: number;
}

export function CalendarWidget({ month, year }: CalendarWidgetProps) {
  const date = new Date();
  const currentMonth = month !== undefined ? month : date.getMonth();
  const currentYear = year !== undefined ? year : date.getFullYear();

  const monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Adjust for Monday start (ISO)
  const startDay = firstDay === 0 ? 6 : firstDay - 1;

  const days = [];
  for (let i = 0; i < startDay; i++) {
    days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const isToday = 
      i === date.getDate() && 
      currentMonth === date.getMonth() && 
      currentYear === date.getFullYear();
    days.push(
      <div key={`day-${i}`} className={`calendar-day ${isToday ? 'today' : ''}`}>
        {i}
      </div>
    );
  }

  return (
    <div className="widget glass calendar-widget">
      <div className="calendar-header">
        <h3 className="text-heading-medium">{monthNames[currentMonth]} {currentYear}</h3>
      </div>
      <div className="calendar-grid">
        <div className="calendar-weekday text-label">Mo</div>
        <div className="calendar-weekday text-label">Di</div>
        <div className="calendar-weekday text-label">Mi</div>
        <div className="calendar-weekday text-label">Do</div>
        <div className="calendar-weekday text-label">Fr</div>
        <div className="calendar-weekday text-label">Sa</div>
        <div className="calendar-weekday text-label">So</div>
        {days}
      </div>
    </div>
  )
}
