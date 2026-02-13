/**
 * Export deadlines to CSV format
 */
export const exportDeadlinesCSV = (deadlines: any[]) => {
  const headers = ['Date', 'College Name', 'Deadline Type', 'Status', 'Description'];
  const rows = deadlines.map(d => [
    d.deadline_date,
    d.college_name,
    d.deadline_type,
    d.is_completed ? 'Completed' : 'Pending',
    d.description || ''
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `college_deadlines_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Export deadlines to iCal format
 */
export const exportDeadlinesICal = (deadlines: any[]) => {
  const icalEvents = deadlines.map(d => {
    const date = d.deadline_date.replace(/-/g, '');
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    return [
      'BEGIN:VEVENT',
      `UID:deadline-${d.id}@collegeos.app`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${d.college_name} - ${d.deadline_type}`,
      `DESCRIPTION:${d.description || 'Application deadline for ' + d.college_name}`,
      'END:VEVENT'
    ].join('\r\n');
  }).join('\r\n');
  
  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CollegeOS//EN',
    icalEvents,
    'END:VCALENDAR'
  ].join('\r\n');
  
  const blob = new Blob([ical], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `deadlines_${new Date().toISOString().split('T')[0]}.ics`;
  link.click();
  URL.revokeObjectURL(url);
};
