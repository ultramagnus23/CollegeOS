// src/components/chancing/ChancingCard.tsx
// Shows admission chance for a single college

import React from 'react';
import { TrendingUp, TrendingDown, Minus, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ChancingFactor {
  name: string;
  impact: string;
  details: string;
  positive: boolean;
}

interface ChancingData {
  chance: number;
  category: 'Safety' | 'Target' | 'Reach';
  factors: ChancingFactor[];
  recommendation: string;
}

interface ChancingCardProps {
  collegeName: string;
  collegeLocation?: string;
  chancing: ChancingData;
  showDetails?: boolean;
}

const CATEGORY_COLORS = {
  Safety: 'bg-green-100 text-green-800 border-green-200',
  Target: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Reach: 'bg-red-100 text-red-800 border-red-200'
};

const CATEGORY_PROGRESS_COLORS = {
  Safety: 'bg-green-500',
  Target: 'bg-yellow-500',
  Reach: 'bg-red-500'
};

export default function ChancingCard({ collegeName, collegeLocation, chancing, showDetails = false }: ChancingCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">{collegeName}</h3>
            {collegeLocation && (
              <p className="text-sm text-gray-500">{collegeLocation}</p>
            )}
          </div>
          <Badge className={CATEGORY_COLORS[chancing.category]}>
            {chancing.category}
          </Badge>
        </div>
        
        <div className="flex items-center gap-4 mb-3">
          <div className="text-3xl font-bold">{chancing.chance}%</div>
          <div className="flex-grow">
            <Progress 
              value={chancing.chance} 
              className={`h-2 ${CATEGORY_PROGRESS_COLORS[chancing.category]}`}
            />
          </div>
        </div>
        
        <p className="text-sm text-gray-600 mb-3">{chancing.recommendation}</p>
        
        {showDetails && chancing.factors && chancing.factors.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Factors</h4>
            <div className="space-y-2">
              {chancing.factors.map((factor, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  {factor.positive ? (
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-medium">{factor.name}</span>
                    <span className={`ml-2 ${factor.positive ? 'text-green-600' : 'text-yellow-600'}`}>
                      {factor.impact}
                    </span>
                    <p className="text-gray-500 text-xs">{factor.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
