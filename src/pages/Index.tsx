import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Dashboard } from '@/pages/Dashboard';
import { Research } from '@/pages/Research';
import { Applications } from '@/pages/Applications';
import { Timeline } from '@/pages/Timeline';
import { Essays } from '@/pages/Essays';
import { Settings } from '@/pages/Settings';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const Index = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'research':
        return <Research />;
      case 'applications':
        return <Applications />;
      case 'timeline':
        return <Timeline />;
      case 'essays':
        return <Essays />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <Sidebar 
          currentPage={currentPage} 
          onNavigate={setCurrentPage}
          userName="Alex Chen"
        />
        
        {/* Main content area */}
        <main className={cn(
          'transition-all duration-300',
          'lg:ml-64 min-h-screen'
        )}>
          <div className="p-6 lg:p-8 pt-16 lg:pt-8">
            {renderPage()}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default Index;
