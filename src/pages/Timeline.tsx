import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TimelineItem } from '@/components/dashboard/TimelineItem';
import { sampleTimelineEvents, sampleColleges } from '@/data/mockData';
import { TimelineEvent } from '@/types';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  Circle,
  Flag,
  Bell,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isSameMonth, addMonths, subMonths } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Timeline() {
  const [events, setEvents] = useState(sampleTimelineEvents);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const toggleEvent = (id: string) => {
    setEvents(prev => 
      prev.map(e => e.id === id ? { ...e, completed: !e.completed } : e)
    );
  };

  const filteredEvents = events.filter(event => {
    if (filter === 'pending' && event.completed) return false;
    if (filter === 'completed' && !event.completed) return false;
    if (typeFilter !== 'all' && event.type !== typeFilter) return false;
    return true;
  });

  const sortedEvents = [...filteredEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Group events by date
  const groupedEvents = sortedEvents.reduce((acc, event) => {
    const dateKey = format(event.date, 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);

  // Calendar data
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getEventsForDay = (day: Date) => {
    return events.filter(e => isSameDay(e.date, day));
  };

  const pendingCount = events.filter(e => !e.completed).length;
  const completedCount = events.filter(e => e.completed).length;

  return (
    <div className="space-y-6">
      <Header 
        title="Timeline" 
        subtitle="View all your deadlines and milestones"
      />

      {/* Quick stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 rounded-full text-sm">
          <Circle className="w-3.5 h-3.5 text-warning" />
          <span className="font-medium">{pendingCount}</span>
          <span className="text-muted-foreground">pending</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 rounded-full text-sm">
          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          <span className="font-medium">{completedCount}</span>
          <span className="text-muted-foreground">completed</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button 
                variant="ghost" 
                size="icon-sm"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h3 className="font-semibold">{format(currentMonth, 'MMMM yyyy')}</h3>
              <Button 
                variant="ghost" 
                size="icon-sm"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before month starts */}
              {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              
              {days.map(day => {
                const dayEvents = getEventsForDay(day);
                const hasDeadline = dayEvents.some(e => e.type === 'deadline' && !e.completed);
                const hasReminder = dayEvents.some(e => e.type === 'reminder' && !e.completed);
                
                return (
                  <button
                    key={day.toISOString()}
                    className={cn(
                      'aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative transition-all',
                      isToday(day) && 'bg-primary text-primary-foreground font-bold',
                      !isToday(day) && 'hover:bg-muted',
                      !isSameMonth(day, currentMonth) && 'text-muted-foreground opacity-50'
                    )}
                  >
                    {format(day, 'd')}
                    {dayEvents.length > 0 && (
                      <div className="absolute bottom-1 flex gap-0.5">
                        {hasDeadline && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
                        {hasReminder && <span className="w-1.5 h-1.5 rounded-full bg-warning" />}
                        {!hasDeadline && !hasReminder && <span className="w-1.5 h-1.5 rounded-full bg-success" />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-muted-foreground">Deadline</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-warning" />
                <span className="text-muted-foreground">Reminder</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-muted-foreground">Milestone</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timeline List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-[140px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="deadline">Deadlines</SelectItem>
                <SelectItem value="reminder">Reminders</SelectItem>
                <SelectItem value="milestone">Milestones</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Events list */}
          <Card>
            <CardContent className="pt-6">
              {Object.keys(groupedEvents).length > 0 ? (
                <div className="space-y-6">
                  {Object.entries(groupedEvents).map(([dateKey, dayEvents]) => (
                    <div key={dateKey}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(dateKey), 'EEEE, MMMM d, yyyy')}
                        {isToday(new Date(dateKey)) && (
                          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                            Today
                          </span>
                        )}
                      </h3>
                      <div className="space-y-0">
                        {dayEvents.map((event, index) => (
                          <TimelineItem
                            key={event.id}
                            event={event}
                            isLast={index === dayEvents.length - 1}
                            onToggle={toggleEvent}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">No events match your filters</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
