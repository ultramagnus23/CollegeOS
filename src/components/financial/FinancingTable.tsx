// src/components/financial/FinancingTable.tsx
// Loan comparison table with EMI calculator, fit score badges, and pros/cons.

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  AlertTriangle,
  TrendingDown,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FitFactor {
  label: string;
  positive: boolean;
}

interface EMIData {
  emiUSD: number;
  totalPayableUSD: number;
  totalInterestUSD: number;
}

interface FinancingOption {
  id: number;
  name: string;
  provider: string;
  financing_type: string;
  amount_min_usd: number | null;
  amount_max_usd: number | null;
  amount_notes: string | null;
  interest_rate_pct: number | null;
  interest_type: string | null;
  repayment_grace_months: number | null;
  repayment_term_months: number | null;
  loan_forgiveness_available: boolean;
  renewable: boolean;
  application_url: string | null;
  deadline_description: string | null;
  source_url: string;
  last_verified_at: string;

  // Annotated by financialCostService
  fitScore: number;
  fitFactors: FitFactor[];
  emi: EMIData | null;
}

interface FinancingTableProps {
  options: FinancingOption[];
  isLoading?: boolean;
  requiredAmountUSD?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUSD(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function fitScoreColor(score: number): string {
  if (score >= 70) return 'text-green-700 bg-green-50 border-green-200';
  if (score >= 40) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function fitProgressColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

const TYPE_LABELS: Record<string, string> = {
  federal_loan: 'Federal Loan',
  private_loan: 'Private Loan',
  grant: 'Grant',
  scholarship: 'Scholarship',
  work_study: 'Work-Study',
  fellowship: 'Fellowship',
};

const TYPE_COLORS: Record<string, string> = {
  federal_loan: 'bg-blue-100 text-blue-800',
  private_loan: 'bg-orange-100 text-orange-800',
  grant: 'bg-green-100 text-green-800',
  scholarship: 'bg-purple-100 text-purple-800',
  work_study: 'bg-teal-100 text-teal-800',
  fellowship: 'bg-indigo-100 text-indigo-800',
};

// ── Row component ─────────────────────────────────────────────────────────────

function FinancingRow({ option }: { option: FinancingOption }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Main row */}
      <tr
        className="hover:bg-gray-50 cursor-pointer border-b border-gray-100 transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        {/* Name + type */}
        <td className="py-3 px-4">
          <div className="font-medium text-sm text-gray-900 leading-snug">{option.name}</div>
          <div className="text-xs text-gray-500">{option.provider}</div>
          <span
            className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 ${TYPE_COLORS[option.financing_type] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {TYPE_LABELS[option.financing_type] ?? option.financing_type}
          </span>
        </td>

        {/* Amount */}
        <td className="py-3 px-4 text-sm tabular-nums text-gray-800 whitespace-nowrap">
          {option.amount_min_usd || option.amount_max_usd ? (
            <>
              {option.amount_min_usd && option.amount_max_usd
                ? `${formatUSD(option.amount_min_usd)} – ${formatUSD(option.amount_max_usd)}`
                : formatUSD(option.amount_max_usd ?? option.amount_min_usd)}
            </>
          ) : (
            <span className="text-gray-400">{option.amount_notes ?? '—'}</span>
          )}
        </td>

        {/* Interest */}
        <td className="py-3 px-4 text-sm tabular-nums text-center">
          {option.interest_rate_pct !== null ? (
            <span className={option.interest_rate_pct === 0 ? 'text-green-600 font-semibold' : ''}>
              {option.interest_rate_pct === 0 ? '0% (interest-free)' : `${option.interest_rate_pct}%`}
              {option.interest_type && option.interest_rate_pct !== 0 && (
                <span className="text-gray-400 text-xs"> {option.interest_type}</span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">N/A</span>
          )}
        </td>

        {/* EMI */}
        <td className="py-3 px-4 text-sm tabular-nums text-center">
          {option.emi ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted">
                    {formatUSD(option.emi.emiUSD)}/mo
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Total payable: {formatUSD(option.emi.totalPayableUSD)}</p>
                  <p className="text-xs">Total interest: {formatUSD(option.emi.totalInterestUSD)}</p>
                  <p className="text-xs text-gray-400">(over {option.repayment_term_months} months)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>

        {/* Fit score */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-16">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${fitProgressColor(option.fitScore)}`}
                  style={{ width: `${option.fitScore}%` }}
                />
              </div>
            </div>
            <span
              className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${fitScoreColor(option.fitScore)}`}
            >
              {option.fitScore}/100
            </span>
          </div>
        </td>

        {/* Expand toggle */}
        <td className="py-3 px-4 text-center">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400 mx-auto" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400 mx-auto" />
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={6} className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pros / Cons from fit factors */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Fit Factors</p>
                <ul className="space-y-1">
                  {option.fitFactors.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      {f.positive ? (
                        <BadgeCheck className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <span className={f.positive ? 'text-gray-700' : 'text-gray-500'}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Additional details */}
              <div className="space-y-1 text-xs text-gray-600">
                {option.repayment_grace_months != null && (
                  <p><span className="font-medium">Grace period:</span> {option.repayment_grace_months} months</p>
                )}
                {option.repayment_term_months != null && (
                  <p><span className="font-medium">Repayment term:</span> {option.repayment_term_months} months</p>
                )}
                {option.loan_forgiveness_available && (
                  <p className="text-green-700 flex items-center gap-1">
                    <TrendingDown className="h-3.5 w-3.5" />
                    Loan forgiveness available
                  </p>
                )}
                {option.renewable && (
                  <p><span className="font-medium">Renewable:</span> Yes</p>
                )}
                {option.deadline_description && (
                  <p><span className="font-medium">Deadline:</span> {option.deadline_description}</p>
                )}
                <p className="text-gray-400 text-[10px]">
                  Last verified: {new Date(option.last_verified_at).toLocaleDateString()}
                  {' '}·{' '}
                  <a href={option.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                    Source
                  </a>
                </p>
                {option.application_url && (
                  <a
                    href={option.application_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 underline mt-1"
                  >
                    Apply now ↗
                  </a>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinancingTable({ options, isLoading = false, requiredAmountUSD }: FinancingTableProps) {
  const [sortByFit, setSortByFit] = useState(true);

  const sorted = [...options].sort((a, b) =>
    sortByFit ? b.fitScore - a.fitScore : a.name.localeCompare(b.name)
  );

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg">
            Financing Options
            {requiredAmountUSD !== undefined && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                for {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(requiredAmountUSD)}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Info className="h-3.5 w-3.5 text-gray-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Fit score (0–100) reflects how well each option matches your financial profile,
                  required amount, citizenship, and loan type preference. Click a row for details.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSortByFit(p => !p)}
            >
              Sort by: {sortByFit ? 'Fit score' : 'Name'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 overflow-x-auto">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500 text-sm">Loading financing options…</div>
        ) : options.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No financing options found for your criteria.
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-left border-collapse">
            <thead>
              <tr className="text-xs font-semibold text-gray-500 border-b border-gray-200">
                <th className="py-2 px-4">Name / Provider</th>
                <th className="py-2 px-4">Amount</th>
                <th className="py-2 px-4 text-center">Interest</th>
                <th className="py-2 px-4 text-center">EMI</th>
                <th className="py-2 px-4">Fit Score</th>
                <th className="py-2 px-4" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(option => (
                <FinancingRow key={option.id} option={option} />
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export default FinancingTable;
