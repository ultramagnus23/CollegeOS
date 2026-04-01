// src/components/financial/CollegeCostCard.tsx
// Full cost-of-attendance card with USD/INR toggle, component breakdown,
// and relevant scholarship highlights.

import React, { useState } from 'react';
import {
  DollarSign,
  IndianRupee,
  GraduationCap,
  Home,
  Heart,
  Plane,
  BookOpen,
  AlertCircle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CostComponent {
  valueUSD: number | null;
  sourceUrl: string | null;
  sourceType: string | null;
  notes: string;
  status: 'verified' | 'estimated' | 'unavailable';
}

interface COAData {
  collegeId: number;
  components: {
    tuition: CostComponent;
    living: CostComponent;
    insurance: CostComponent;
    visa: CostComponent;
  };
  totalUSD: number | null;
  totalINR: number | null;
  exchangeRate: number | null;
  conversionNote: string | null;
  isComplete: boolean;
  missingComponents: string[];
  computedAt: string;
  disclaimer: string;
}

interface Scholarship {
  id: number;
  name: string;
  provider: string;
  amount_max: number | null;
  currency: string;
  deadline: string | null;
  need_based: boolean;
  merit_based: boolean;
}

interface CollegeCostCardProps {
  collegeName: string;
  coa: COAData;
  scholarships?: Scholarship[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<CostComponent['status'], string> = {
  verified: 'text-green-600',
  estimated: 'text-amber-600',
  unavailable: 'text-gray-400',
};

const STATUS_BADGE: Record<CostComponent['status'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  verified: { label: 'Verified', variant: 'default' },
  estimated: { label: 'Estimated', variant: 'secondary' },
  unavailable: { label: 'No data', variant: 'outline' },
};

function formatUSD(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatINR(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

// ── Component row ─────────────────────────────────────────────────────────────

interface ComponentRowProps {
  label: string;
  icon: React.ElementType;
  component: CostComponent;
  showINR: boolean;
  exchangeRate: number | null;
}

function ComponentRow({ label, icon: Icon, component, showINR, exchangeRate }: ComponentRowProps) {
  const badge = STATUS_BADGE[component.status];
  const displayValue = showINR && component.valueUSD !== null && exchangeRate
    ? formatINR(Math.round(component.valueUSD * exchangeRate))
    : formatUSD(component.valueUSD);

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`h-4 w-4 shrink-0 ${STATUS_COLORS[component.status]}`} />
        <span className="text-sm text-gray-700 truncate">{label}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant={badge.variant} className="text-xs cursor-help shrink-0">
                {badge.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">{component.notes}</p>
              {component.sourceUrl && (
                <a
                  href={component.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 underline block mt-1"
                >
                  Source ↗
                </a>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <span className={`text-sm font-medium tabular-nums shrink-0 ${STATUS_COLORS[component.status]}`}>
        {displayValue}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CollegeCostCard({
  collegeName,
  coa,
  scholarships = [],
  isLoading = false,
  onRefresh,
}: CollegeCostCardProps) {
  const [showINR, setShowINR] = useState(false);

  const totalDisplay = showINR
    ? formatINR(coa.totalINR)
    : formatUSD(coa.totalUSD);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight">{collegeName} — Cost of Attendance</CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            {/* Currency toggle */}
            <div className="flex rounded-md border overflow-hidden">
              <Button
                variant={showINR ? 'ghost' : 'default'}
                size="sm"
                className="h-7 rounded-none px-2 text-xs"
                onClick={() => setShowINR(false)}
              >
                <DollarSign className="h-3 w-3 mr-1" />
                USD
              </Button>
              <Button
                variant={showINR ? 'default' : 'ghost'}
                size="sm"
                className="h-7 rounded-none px-2 text-xs"
                onClick={() => setShowINR(true)}
                disabled={!coa.exchangeRate}
              >
                <IndianRupee className="h-3 w-3 mr-1" />
                INR
              </Button>
            </div>
            {onRefresh && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh} disabled={isLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {!coa.isComplete && (
          <div className="flex items-start gap-1.5 mt-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Partial data — missing: {coa.missingComponents.join(', ')}.
              Total shown is incomplete.
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Component breakdown */}
        <div className="divide-y divide-gray-100">
          <ComponentRow
            label="Tuition & Fees"
            icon={GraduationCap}
            component={coa.components.tuition}
            showINR={showINR}
            exchangeRate={coa.exchangeRate}
          />
          <ComponentRow
            label="Room & Board"
            icon={Home}
            component={coa.components.living}
            showINR={showINR}
            exchangeRate={coa.exchangeRate}
          />
          <ComponentRow
            label="Health Insurance"
            icon={Heart}
            component={coa.components.insurance}
            showINR={showINR}
            exchangeRate={coa.exchangeRate}
          />
          <ComponentRow
            label="Visa & SEVIS"
            icon={Plane}
            component={coa.components.visa}
            showINR={showINR}
            exchangeRate={coa.exchangeRate}
          />
        </div>

        <Separator className="my-3" />

        {/* Total */}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-900">
            {coa.isComplete ? 'Total COA' : 'Partial Total'}
          </span>
          <span className="font-bold text-xl tabular-nums">{totalDisplay}</span>
        </div>

        {/* Exchange rate note */}
        {showINR && coa.conversionNote && (
          <p className="text-xs text-gray-500 mt-1">{coa.conversionNote}</p>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 mt-2 flex items-start gap-1">
          <CheckCircle className="h-3 w-3 mt-0.5 shrink-0 text-gray-300" />
          {coa.disclaimer}
        </p>

        {/* Scholarships */}
        {scholarships.length > 0 && (
          <>
            <Separator className="my-3" />
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1">
                <BookOpen className="h-4 w-4 text-blue-500" />
                Available Scholarships ({scholarships.length})
              </p>
              <div className="space-y-1.5">
                {scholarships.slice(0, 4).map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-blue-50 rounded px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{s.name}</p>
                      <p className="text-xs text-gray-500 truncate">{s.provider}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      {s.amount_max ? (
                        <p className="text-xs font-semibold text-green-700">
                          Up to {formatUSD(s.amount_max)}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">Varies</p>
                      )}
                      <div className="flex gap-1 justify-end mt-0.5">
                        {s.merit_based && <Badge variant="outline" className="text-[10px] px-1 py-0">Merit</Badge>}
                        {s.need_based && <Badge variant="outline" className="text-[10px] px-1 py-0">Need</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
                {scholarships.length > 4 && (
                  <p className="text-xs text-blue-600 text-center">
                    +{scholarships.length - 4} more scholarships available
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default CollegeCostCard;
