import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Bell } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showSearch?: boolean;
  onAddNew?: () => void;
  addNewLabel?: string;
  className?: string;
}

export function Header({ 
  title, 
  subtitle, 
  showSearch = false, 
  onAddNew,
  addNewLabel = 'Add New',
  className 
}: HeaderProps) {
  return (
    <header className={cn(
      'flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6',
      className
    )}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {showSearch && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search colleges..." 
              className="pl-9 w-[200px] sm:w-[280px]"
            />
          </div>
        )}
        
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
        </Button>

        {onAddNew && (
          <Button onClick={onAddNew} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{addNewLabel}</span>
          </Button>
        )}
      </div>
    </header>
  );
}
