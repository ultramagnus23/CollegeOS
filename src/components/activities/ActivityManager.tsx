// src/components/activities/ActivityManager.tsx
// Common App-style activity tracker component

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Award, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { api } from '@/services/api';

// Activity type options (matching Common App)
const ACTIVITY_TYPES = [
  'Academic',
  'Art',
  'Athletics: Club',
  'Athletics: JV/Varsity',
  'Career-Oriented',
  'Community Service (Volunteer)',
  'Computer/Technology',
  'Cultural',
  'Dance',
  'Debate/Speech',
  'Environmental',
  'Family Responsibilities',
  'Foreign Exchange',
  'Internship',
  'Journalism/Publication',
  'Junior ROTC',
  'Music: Instrumental',
  'Music: Vocal',
  'Religious',
  'Research',
  'Robotics',
  'School Spirit',
  'Science/Math',
  'Social Justice',
  'Student Government',
  'Theater/Drama',
  'Work (Paid)',
  'Other'
];

// Tier badge colors
const TIER_COLORS: Record<number, string> = {
  1: 'bg-yellow-500 text-yellow-900',
  2: 'bg-gray-400 text-foreground',
  3: 'bg-amber-600 text-amber-100',
  4: 'bg-muted text-foreground'
};

const TIER_NAMES: Record<number, string> = {
  1: 'National/International',
  2: 'State/Regional',
  3: 'School Leadership',
  4: 'Participation'
};

interface Activity {
  id?: number;
  activity_name: string;
  activity_type: string;
  position_title: string;
  organization_name: string;
  description: string;
  grade_9: boolean;
  grade_10: boolean;
  grade_11: boolean;
  grade_12: boolean;
  hours_per_week: number;
  weeks_per_year: number;
  total_hours?: number;
  awards_recognition: string;
  tier_rating: number;
  display_order?: number;
}

const emptyActivity: Activity = {
  activity_name: '',
  activity_type: '',
  position_title: '',
  organization_name: '',
  description: '',
  grade_9: false,
  grade_10: false,
  grade_11: false,
  grade_12: false,
  hours_per_week: 0,
  weeks_per_year: 0,
  awards_recognition: '',
  tier_rating: 4
};

export default function ActivityManager() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const response = await api.getActivities();
      if (response.success) {
        setActivities(response.data || []);
        setSummary(response.summary || {});
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error);
      toast.error('Failed to load activities');
    } finally {
      setLoading(false);
    }
  };

  const handleAddActivity = () => {
    if (activities.length >= 10) {
      toast.error('Maximum 10 activities allowed (Common App limit)');
      return;
    }
    setEditingActivity({ ...emptyActivity });
    setIsDialogOpen(true);
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity({ ...activity });
    setIsDialogOpen(true);
  };

  const handleSaveActivity = async () => {
    if (!editingActivity) return;
    
    if (!editingActivity.activity_name.trim()) {
      toast.error('Activity name is required');
      return;
    }

    try {
      setSaving(true);
      
      if (editingActivity.id) {
        // Update existing
        await api.updateActivity(editingActivity.id, editingActivity);
        toast.success('Activity updated');
      } else {
        // Create new
        await api.addActivity(editingActivity);
        toast.success('Activity added');
      }
      
      setIsDialogOpen(false);
      setEditingActivity(null);
      fetchActivities();
    } catch (error) {
      console.error('Failed to save activity:', error);
      toast.error('Failed to save activity');
    } finally {
      setSaving(false);
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  
  const handleDeleteActivity = async (id: number) => {
    try {
      await api.deleteActivity(id);
      toast.success('Activity deleted');
      setDeleteConfirmId(null);
      fetchActivities();
    } catch (error) {
      console.error('Failed to delete activity:', error);
      toast.error('Failed to delete activity');
    }
  };

  const updateEditingField = (field: string, value: any) => {
    if (!editingActivity) return;
    setEditingActivity({ ...editingActivity, [field]: value });
  };

  const getGradesString = (activity: Activity) => {
    const grades = [];
    if (activity.grade_9) grades.push('9');
    if (activity.grade_10) grades.push('10');
    if (activity.grade_11) grades.push('11');
    if (activity.grade_12) grades.push('12');
    return grades.length > 0 ? `Grades: ${grades.join(', ')}` : 'No grades selected';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{activities.length}/10</div>
            <div className="text-sm text-muted-foreground">Activities</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{summary.tier1?.count || 0}</div>
            <div className="text-sm text-muted-foreground">Tier 1 (National)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-muted-foreground">{summary.tier2?.count || 0}</div>
            <div className="text-sm text-muted-foreground">Tier 2 (State)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{summary.totalHours || 0}</div>
            <div className="text-sm text-muted-foreground">Total Hours</div>
          </CardContent>
        </Card>
      </div>

      {/* Add Activity Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Your Activities</h2>
        <Button onClick={handleAddActivity} disabled={activities.length >= 10}>
          <Plus className="h-4 w-4 mr-2" />
          Add Activity
        </Button>
      </div>

      {/* Activities List */}
      {activities.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No activities added yet. Add your extracurricular activities to strengthen your college applications.</p>
          <Button onClick={handleAddActivity}>
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Activity
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <Card key={activity.id || index} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 cursor-move">
                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                  </div>
                  
                  <div className="flex-grow">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{activity.activity_name}</h3>
                        <p className="text-sm text-muted-foreground">{activity.position_title}</p>
                        {activity.organization_name && (
                          <p className="text-sm text-muted-foreground">{activity.organization_name}</p>
                        )}
                      </div>
                      <Badge className={TIER_COLORS[activity.tier_rating]}>
                        Tier {activity.tier_rating}
                      </Badge>
                    </div>
                    
                    {activity.description && (
                      <p className="mt-2 text-sm text-foreground">{activity.description}</p>
                    )}
                    
                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {getGradesString(activity)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {activity.hours_per_week} hrs/week, {activity.weeks_per_year} weeks/year
                      </span>
                      {activity.total_hours && (
                        <span className="font-medium">
                          Total: {activity.total_hours} hours
                        </span>
                      )}
                    </div>
                    
                    {activity.awards_recognition && (
                      <div className="mt-2 flex items-center gap-1 text-sm text-yellow-600">
                        <Award className="h-4 w-4" />
                        {activity.awards_recognition}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-shrink-0 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditActivity(activity)}>
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Activity</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{activity.activity_name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => activity.id && handleDeleteActivity(activity.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingActivity?.id ? 'Edit Activity' : 'Add Activity'}
            </DialogTitle>
          </DialogHeader>
          
          {editingActivity && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Activity Name *</Label>
                  <Input
                    value={editingActivity.activity_name}
                    onChange={(e) => updateEditingField('activity_name', e.target.value)}
                    placeholder="e.g., Model United Nations"
                  />
                </div>
                
                <div>
                  <Label>Activity Type</Label>
                  <Select
                    value={editingActivity.activity_type}
                    onValueChange={(value) => updateEditingField('activity_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Position/Role</Label>
                  <Input
                    value={editingActivity.position_title}
                    onChange={(e) => updateEditingField('position_title', e.target.value)}
                    placeholder="e.g., President, Captain, Member"
                  />
                </div>
                
                <div>
                  <Label>Organization Name</Label>
                  <Input
                    value={editingActivity.organization_name}
                    onChange={(e) => updateEditingField('organization_name', e.target.value)}
                    placeholder="e.g., School MUN Club"
                  />
                </div>
              </div>
              
              <div>
                <Label>Description (max 150 characters)</Label>
                <Textarea
                  value={editingActivity.description}
                  onChange={(e) => updateEditingField('description', e.target.value.slice(0, 150))}
                  placeholder="Describe your role and accomplishments..."
                  className="h-20"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editingActivity.description.length}/150 characters
                </p>
              </div>
              
              <div>
                <Label>Grade Levels Participated</Label>
                <div className="flex gap-6 mt-2">
                  {[9, 10, 11, 12].map(grade => (
                    <div key={grade} className="flex items-center gap-2">
                      <Checkbox
                        id={`grade-${grade}`}
                        checked={editingActivity[`grade_${grade}` as keyof Activity] as boolean}
                        onCheckedChange={(checked) => updateEditingField(`grade_${grade}`, checked)}
                      />
                      <Label htmlFor={`grade-${grade}`}>Grade {grade}</Label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Hours per Week</Label>
                  <Input
                    type="number"
                    min="0"
                    max="40"
                    value={editingActivity.hours_per_week}
                    onChange={(e) => updateEditingField('hours_per_week', parseFloat(e.target.value) || 0)}
                  />
                </div>
                
                <div>
                  <Label>Weeks per Year</Label>
                  <Input
                    type="number"
                    min="0"
                    max="52"
                    value={editingActivity.weeks_per_year}
                    onChange={(e) => updateEditingField('weeks_per_year', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
              
              <div>
                <Label>Awards/Recognition</Label>
                <Textarea
                  value={editingActivity.awards_recognition}
                  onChange={(e) => updateEditingField('awards_recognition', e.target.value)}
                  placeholder="List any awards, honors, or recognition received..."
                  className="h-16"
                />
              </div>
              
              <div>
                <Label>Tier Rating</Label>
                <Select
                  value={String(editingActivity.tier_rating)}
                  onValueChange={(value) => updateEditingField('tier_rating', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Tier 1 - National/International Level</SelectItem>
                    <SelectItem value="2">Tier 2 - State/Regional Level</SelectItem>
                    <SelectItem value="3">Tier 3 - School Leadership</SelectItem>
                    <SelectItem value="4">Tier 4 - Participation</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Higher tiers indicate more impressive achievements
                </p>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveActivity} disabled={saving}>
                  {saving ? 'Saving...' : (editingActivity.id ? 'Update' : 'Add')} Activity
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
