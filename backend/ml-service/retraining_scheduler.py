# backend/ml-service/retraining_scheduler.py
# Automated model retraining scheduler

import os
import json
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import time

import config
from lda_trainer import lda_trainer
from prediction_service import prediction_service


class RetrainingScheduler:
    """
    Manages automated retraining of LDA models.
    
    Features:
    - Checks for sufficient new data
    - Triggers retraining when thresholds are met
    - Tracks retraining history
    - Monitors model performance over time
    """
    
    def __init__(self, db_path: str = None):
        self.db_path = db_path
        self.retraining_log = []
        
    def set_database_path(self, db_path: str):
        """Set the path to the SQLite database."""
        self.db_path = db_path
    
    def get_training_data_from_db(self, college_id: Optional[int] = None) -> List[Dict]:
        """
        Fetch training data from the SQLite database.
        
        Args:
            college_id: Optional filter for specific college
            
        Returns:
            List of training data records
        """
        if not self.db_path or not os.path.exists(self.db_path):
            return []
        
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Query training data with confidence filtering
            query = '''
                SELECT 
                    t.id,
                    t.student_id,
                    t.college_id,
                    t.gpa,
                    t.sat_total,
                    t.act_composite,
                    t.class_rank_percentile,
                    t.num_ap_courses,
                    t.activity_tier_1_count as activity_tier1_count,
                    t.activity_tier_2_count as activity_tier2_count,
                    t.is_first_gen,
                    t.is_legacy,
                    t.state,
                    t.college_acceptance_rate,
                    t.decision,
                    t.application_year,
                    t.created_at,
                    COALESCE(t.confidence_score, 0.7) as confidence_score,
                    COALESCE(t.is_verified, 0) as is_verified,
                    COALESCE(t.source, 'user_submitted') as source
                FROM ml_training_data t
                WHERE t.decision IN ('accepted', 'rejected')
            '''
            
            params = []
            if college_id:
                query += ' AND t.college_id = ?'
                params.append(college_id)
            
            query += ' ORDER BY t.created_at DESC'
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            conn.close()
            
            return [dict(row) for row in rows]
            
        except Exception as e:
            print(f"Error fetching training data: {e}")
            return []
    
    def get_colleges_needing_retraining(self) -> List[Dict]:
        """
        Identify colleges that need model retraining.
        
        Criteria:
        - No existing model
        - Model is older than 30 days
        - Significant new data since last training
        """
        colleges_to_retrain = []
        
        if not self.db_path or not os.path.exists(self.db_path):
            return colleges_to_retrain
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get colleges with training data
            cursor.execute('''
                SELECT 
                    college_id,
                    COUNT(*) as total_samples,
                    SUM(CASE WHEN decision = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
                    SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
                    MAX(created_at) as latest_data
                FROM ml_training_data
                WHERE decision IN ('accepted', 'rejected')
                GROUP BY college_id
                HAVING total_samples >= ?
            ''', (config.MIN_SAMPLES_FOR_TRAINING,))
            
            rows = cursor.fetchall()
            conn.close()
            
            for row in rows:
                college_id, total, accepted, rejected, latest_data = row
                
                # Check class balance
                if accepted < config.MIN_SAMPLES_PER_CLASS or rejected < config.MIN_SAMPLES_PER_CLASS:
                    continue
                
                # Check if model exists and when it was trained
                metadata = lda_trainer.load_model_metadata(college_id)
                
                needs_training = False
                reason = ''
                
                if not metadata:
                    needs_training = True
                    reason = 'No existing model'
                else:
                    trained_at = datetime.fromisoformat(metadata['trained_at'])
                    days_since_training = (datetime.now() - trained_at).days
                    
                    if days_since_training >= 30:
                        needs_training = True
                        reason = f'Model is {days_since_training} days old'
                    elif total > metadata.get('sample_count', 0) * 1.2:
                        # 20% more data than when trained
                        needs_training = True
                        reason = f'Significant new data ({total} vs {metadata.get("sample_count", 0)})'
                
                if needs_training:
                    colleges_to_retrain.append({
                        'college_id': college_id,
                        'total_samples': total,
                        'accepted_count': accepted,
                        'rejected_count': rejected,
                        'reason': reason,
                        'current_model': metadata
                    })
            
            return colleges_to_retrain
            
        except Exception as e:
            print(f"Error checking retraining needs: {e}")
            return []
    
    def run_retraining_cycle(self, max_colleges: int = 10) -> Dict:
        """
        Run a retraining cycle for colleges that need it.
        
        Args:
            max_colleges: Maximum number of colleges to retrain in one cycle
            
        Returns:
            Summary of retraining results
        """
        results = {
            'started_at': datetime.now().isoformat(),
            'colleges_checked': 0,
            'colleges_retrained': 0,
            'colleges_failed': 0,
            'details': []
        }
        
        colleges = self.get_colleges_needing_retraining()[:max_colleges]
        results['colleges_checked'] = len(colleges)
        
        for college in colleges:
            college_id = college['college_id']
            
            try:
                # Get training data for this college
                training_data = self.get_training_data_from_db(college_id)
                
                if not training_data:
                    results['details'].append({
                        'college_id': college_id,
                        'success': False,
                        'message': 'No training data available'
                    })
                    continue
                
                # Train model
                result = lda_trainer.train_model(college_id, training_data, force=True)
                
                if result.get('success'):
                    results['colleges_retrained'] += 1
                    prediction_service.clear_cache(college_id)
                else:
                    results['colleges_failed'] += 1
                
                results['details'].append(result)
                
            except Exception as e:
                results['colleges_failed'] += 1
                results['details'].append({
                    'college_id': college_id,
                    'success': False,
                    'error': str(e)
                })
        
        results['completed_at'] = datetime.now().isoformat()
        self.retraining_log.append(results)
        
        return results
    
    def get_retraining_history(self, limit: int = 10) -> List[Dict]:
        """Get recent retraining history."""
        return self.retraining_log[-limit:]
    
    def get_data_growth_stats(self) -> Dict:
        """Get statistics about training data growth."""
        if not self.db_path or not os.path.exists(self.db_path):
            return {'error': 'Database not available'}
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Total records
            cursor.execute('SELECT COUNT(*) FROM ml_training_data')
            total_records = cursor.fetchone()[0]
            
            # Records in last 7 days
            cursor.execute('''
                SELECT COUNT(*) FROM ml_training_data 
                WHERE created_at >= datetime('now', '-7 days')
            ''')
            last_7_days = cursor.fetchone()[0]
            
            # Records in last 30 days
            cursor.execute('''
                SELECT COUNT(*) FROM ml_training_data 
                WHERE created_at >= datetime('now', '-30 days')
            ''')
            last_30_days = cursor.fetchone()[0]
            
            # Unique colleges
            cursor.execute('SELECT COUNT(DISTINCT college_id) FROM ml_training_data')
            unique_colleges = cursor.fetchone()[0]
            
            # Decision breakdown
            cursor.execute('''
                SELECT decision, COUNT(*) 
                FROM ml_training_data 
                GROUP BY decision
            ''')
            decisions = dict(cursor.fetchall())
            
            # Verified vs unverified
            cursor.execute('''
                SELECT 
                    SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified,
                    SUM(CASE WHEN is_verified = 0 OR is_verified IS NULL THEN 1 ELSE 0 END) as unverified
                FROM ml_training_data
            ''')
            row = cursor.fetchone()
            verified_count = row[0] or 0
            unverified_count = row[1] or 0
            
            conn.close()
            
            return {
                'total_records': total_records,
                'last_7_days': last_7_days,
                'last_30_days': last_30_days,
                'unique_colleges': unique_colleges,
                'decisions': decisions,
                'verified_count': verified_count,
                'unverified_count': unverified_count,
                'daily_average': last_7_days / 7 if last_7_days else 0
            }
            
        except Exception as e:
            return {'error': str(e)}
    
    def get_colleges_needing_data(self, min_samples: int = None) -> List[Dict]:
        """
        Get colleges that need more data before models can be trained.
        """
        if min_samples is None:
            min_samples = config.MIN_SAMPLES_FOR_TRAINING
        
        if not self.db_path or not os.path.exists(self.db_path):
            return []
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT 
                    t.college_id,
                    c.name as college_name,
                    COUNT(*) as current_samples,
                    SUM(CASE WHEN t.decision = 'accepted' THEN 1 ELSE 0 END) as accepted,
                    SUM(CASE WHEN t.decision = 'rejected' THEN 1 ELSE 0 END) as rejected
                FROM ml_training_data t
                LEFT JOIN colleges c ON t.college_id = c.id
                WHERE t.decision IN ('accepted', 'rejected')
                GROUP BY t.college_id
                HAVING current_samples < ?
                ORDER BY current_samples DESC
            ''', (min_samples,))
            
            rows = cursor.fetchall()
            conn.close()
            
            return [{
                'college_id': row[0],
                'college_name': row[1],
                'current_samples': row[2],
                'accepted': row[3],
                'rejected': row[4],
                'samples_needed': min_samples - row[2]
            } for row in rows]
            
        except Exception as e:
            print(f"Error getting colleges needing data: {e}")
            return []


# Singleton instance
retraining_scheduler = RetrainingScheduler()
