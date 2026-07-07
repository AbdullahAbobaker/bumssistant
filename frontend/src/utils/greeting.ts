export function germanGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Guten Morgen'
  if (hour >= 12 && hour < 18) return 'Guten Tag'
  if (hour >= 18 && hour < 23) return 'Guten Abend'
  return 'Gute Nacht'
}
