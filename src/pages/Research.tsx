import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrustBadge } from '@/components/common/TrustBadge';
import { DataNotAvailable } from '@/components/common/DataNotAvailable';
import { CountdownBadge } from '@/components/common/CountdownBadge';
import { RequirementFlags } from '@/components/common/RequirementFlags';
import { sampleColleges, countries } from '@/data/mockData';
import { College } from '@/types';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Search,
  ExternalLink,
  MapPin,
  Calendar,
  DollarSign,
  FileCheck,
  BookOpen,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Filter,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Research() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);

  const filteredColleges = sampleColleges.filter(college => {
    const matchesSearch = college.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      college.city?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCountry = selectedCountry === 'all' || college.countryCode === selectedCountry;
    return matchesSearch && matchesCountry;
  });

  const getCountryFlag = (code: string) => {
    return countries.find(c => c.code === code)?.flag || '🌍';
  };

  return (
    <div className="space-y-6">
      <Header 
        title="College Research" 
        subtitle="Explore universities worldwide with verified information"
      />

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedCountry} onValueChange={setSelectedCountry}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Globe className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filter by country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {countries.map(country => (
              <SelectItem key={country.code} value={country.code}>
                {country.flag} {country.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Trust Notice */}
      <Card className="bg-accent/30 border-accent">
        <CardContent className="flex items-start gap-3 py-4">
          <CheckCircle2 className="w-5 h-5 text-verified flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-accent-foreground">Zero-Hallucination Policy</p>
            <p className="text-muted-foreground">
              All data shown is sourced from official university websites. Missing information is clearly labeled—we never fabricate data.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* College List */}
        <div className="space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            Universities ({filteredColleges.length})
          </h2>
          
          <div className="space-y-3">
            {filteredColleges.map(college => (
              <Card
                key={college.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-medium',
                  selectedCollege?.id === college.id && 'ring-2 ring-primary'
                )}
                onClick={() => setSelectedCollege(college)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{getCountryFlag(college.countryCode)}</span>
                        <h3 className="font-medium truncate">{college.name}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{college.city}, {college.country}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  </div>
                  
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <RequirementFlags
                      hasPortfolio={college.hasPortfolioRequirement}
                      hasInterview={college.hasInterviewRequirement}
                      hasLanguage={college.hasLanguageRequirement}
                      hasFinancial={college.requiresFinancialDocs}
                    />
                    {college.deadlines[0] && (
                      <CountdownBadge targetDate={college.deadlines[0].date} />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredColleges.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Search className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No colleges found matching your search</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* College Details */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          {selectedCollege ? (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{getCountryFlag(selectedCollege.countryCode)}</span>
                      <CardTitle className="text-xl">{selectedCollege.name}</CardTitle>
                    </div>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {selectedCollege.city}, {selectedCollege.country}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={selectedCollege.officialWebsite} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Website
                    </a>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Deadlines */}
                <div>
                  <h4 className="font-medium flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    Application Deadlines
                  </h4>
                  <div className="space-y-2">
                    {selectedCollege.deadlines.map(deadline => (
                      <div key={deadline.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="font-medium capitalize text-sm">
                            {deadline.type.replace('_', ' ')}
                          </p>
                          <TrustBadge source={deadline.source} className="mt-1" />
                        </div>
                        <div className="text-right">
                          {deadline.date ? (
                            <>
                              <p className="font-medium">{deadline.date.toLocaleDateString()}</p>
                              <CountdownBadge targetDate={deadline.date} showIcon={false} />
                            </>
                          ) : (
                            <span className="text-sm text-missing italic">Date not available</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Requirements */}
                <div>
                  <h4 className="font-medium flex items-center gap-2 mb-3">
                    <FileCheck className="w-4 h-4 text-muted-foreground" />
                    Requirements
                  </h4>
                  {selectedCollege.requirements.value ? (
                    <div className="space-y-2">
                      <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                        {selectedCollege.requirements.value.map((req, i) => (
                          <li key={i}>{req}</li>
                        ))}
                      </ul>
                      <TrustBadge source={selectedCollege.requirements.source} />
                    </div>
                  ) : (
                    <DataNotAvailable 
                      label="Requirements not available"
                      officialUrl={selectedCollege.admissionsUrl}
                    />
                  )}
                </div>

                {/* Test Policy */}
                <div>
                  <h4 className="font-medium mb-2">Testing Policy</h4>
                  {selectedCollege.testPolicy.value ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">{selectedCollege.testPolicy.value}</p>
                      <TrustBadge source={selectedCollege.testPolicy.source} />
                    </div>
                  ) : (
                    <DataNotAvailable 
                      label="Testing policy not available"
                      officialUrl={selectedCollege.admissionsUrl}
                      compact
                    />
                  )}
                </div>

                {/* Application Fee */}
                <div>
                  <h4 className="font-medium flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    Application Fee
                  </h4>
                  {selectedCollege.applicationFee.value ? (
                    <div className="space-y-2">
                      <p className="text-lg font-semibold">{selectedCollege.applicationFee.value}</p>
                      <TrustBadge source={selectedCollege.applicationFee.source} />
                    </div>
                  ) : (
                    <DataNotAvailable 
                      label="Fee information not available"
                      officialUrl={selectedCollege.admissionsUrl}
                      compact
                    />
                  )}
                </div>

                {/* Special Requirements */}
                <div>
                  <h4 className="font-medium mb-3">Special Requirements</h4>
                  <div className="flex flex-wrap gap-2">
                    <RequirementFlags
                      hasPortfolio={selectedCollege.hasPortfolioRequirement}
                      hasInterview={selectedCollege.hasInterviewRequirement}
                      hasLanguage={selectedCollege.hasLanguageRequirement}
                      hasFinancial={selectedCollege.requiresFinancialDocs}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t flex gap-3">
                  <Button className="flex-1">
                    Add to My List
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={selectedCollege.admissionsUrl || selectedCollege.officialWebsite} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Admissions
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="font-medium mb-2">Select a university</h3>
                <p className="text-sm text-muted-foreground">
                  Click on a university to view detailed information with verified sources
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
