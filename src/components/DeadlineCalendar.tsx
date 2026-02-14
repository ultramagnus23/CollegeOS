import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Deadline {
  id: number;
  college_name: string;
  deadline_type: string;
  deadline_date: string;
  is_completed: boolean;
  description?: string;
}

interface DeadlineCalendarProps {
  deadlines: Deadline[];
  onDeadlineClick?: (deadline: Deadline) => void;
}

export const DeadlineCalendar = ({ deadlines, onDeadlineClick }: DeadlineCalendarProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'list'>('month');
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };
  
  const getDeadlinesForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return deadlines.filter(d => d.deadline_date.startsWith(dateStr));
  };
  
  const getDaysUntil = (dateStr: string) => {
    const days = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };
  
  const getUrgencyColor = (dateStr: string) => {
    const days = getDaysUntil(dateStr);
    if (days < 0) return 'bg-gray-100 text-gray-600'; // Overdue
    if (days <= 7) return 'bg-red-100 text-red-800'; // Urgent
    if (days <= 30) return 'bg-yellow-100 text-yellow-800'; // Upcoming
    return 'bg-blue-100 text-blue-800'; // Future
  };
  
  const renderMonthView = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const days = [];
    
    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="p-2 border border-gray-200 bg-gray-50"></div>);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dayDeadlines = getDeadlinesForDate(date);
      const isToday = date.toDateString() === new Date().toDateString();
      
      days.push(
        <div
          key={day}
          className={`p-2 border border-gray-200 min-h-24 ${
            isToday ? 'bg-blue-50 border-blue-300' : 'bg-white'
          }`}
        >
          <div className={`font-semibold mb-1 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
            {day}
          </div>
          <div className="space-y-1">
            {dayDeadlines.slice(0, 3).map(deadline => (
              <div
                key={deadline.id}
                onClick={() => onDeadlineClick?.(deadline)}
                className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 ${
                  deadline.is_completed
                    ? 'bg-green-100 text-green-800 line-through'
                    : getUrgencyColor(deadline.deadline_date)
                }`}
                title={`${deadline.college_name} - ${deadline.deadline_type}`}
              >
                {deadline.college_name.length > 15 
                  ? deadline.college_name.substring(0, 15) + '...'
                  : deadline.college_name}
              </div>
            ))}
            {dayDeadlines.length > 3 && (
              <div className="text-xs text-gray-500 pl-1">
                +{dayDeadlines.length - 3} more
              </div>
            )}
          </div>
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-7 gap-0">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-2 text-center font-bold border border-gray-300 bg-gray-100 text-gray-700">
            {day}
          </div>
        ))}
        {days}
      </div>
    );
  };
  
  const renderListView = () => {
    // Sort deadlines by date
    const sortedDeadlines = [...deadlines].sort((a, b) => 
      new Date(a.deadline_date).getTime() - new Date(b.deadline_date).getTime()
    );
    
    return (
      <div className="space-y-2">
        {sortedDeadlines.map(deadline => {
          const daysUntil = getDaysUntil(deadline.deadline_date);
          return (
            <div
              key={deadline.id}
              onClick={() => onDeadlineClick?.(deadline)}
              className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
                deadline.is_completed
                  ? 'bg-green-50 border-green-200'
                  : daysUntil < 0
                  ? 'bg-gray-50 border-gray-300'
                  : daysUntil <= 7
                  ? 'bg-red-50 border-red-200'
                  : daysUntil <= 30
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{deadline.college_name}</h3>
                  <p className="text-sm text-gray-600">{deadline.deadline_type}</p>
                  {deadline.description && (
                    <p className="text-sm text-gray-500 mt-1">{deadline.description}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">
                    {new Date(deadline.deadline_date).toLocaleDateString()}
                  </div>
                  {!deadline.is_completed && (
                    <div className={`text-sm font-medium ${
                      daysUntil < 0 ? 'text-gray-600' :
                      daysUntil <= 7 ? 'text-red-600' :
                      daysUntil <= 30 ? 'text-yellow-600' : 'text-blue-600'
                    }`}>
                      {daysUntil < 0 ? 'Overdue' : 
                       daysUntil === 0 ? 'Today' :
                       daysUntil === 1 ? 'Tomorrow' :
                       `${daysUntil} days`}
                    </div>
                  )}
                  {deadline.is_completed && (
                    <div className="text-sm text-green-600 font-medium">
                      ✓ Completed
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {sortedDeadlines.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <CalendarIcon className="mx-auto mb-4 text-gray-400" size={48} />
            <p>No deadlines to display</p>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newDate = new Date(currentDate);
              if (view === 'month') {
                newDate.setMonth(newDate.getMonth() - 1);
              } else {
                newDate.setDate(newDate.getDate() - 7);
              }
              setCurrentDate(newDate);
            }}
          >
            <ChevronLeft size={16} />
          </Button>
          <h2 className="text-xl font-bold text-gray-900">
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newDate = new Date(currentDate);
              if (view === 'month') {
                newDate.setMonth(newDate.getMonth() + 1);
              } else {
                newDate.setDate(newDate.getDate() + 7);
              }
              setCurrentDate(newDate);
            }}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={view === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('month')}
          >
            Month
          </Button>
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('list')}
          >
            List
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
        </div>
      </div>
      
      {/* Calendar View */}
      {view === 'month' && renderMonthView()}
      {view === 'list' && renderListView()}
      
      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-100 border border-red-200"></div>
          <span className="text-gray-600">Urgent (≤7 days)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-200"></div>
          <span className="text-gray-600">Upcoming (≤30 days)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
          <span className="text-gray-600">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200"></div>
          <span className="text-gray-600">Overdue</span>
        </div>
      </div>
    </div>
  );
};
