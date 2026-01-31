# backend/ml-service/prediction_service.py
# ML Prediction Service for Admission Chances

import numpy as np
from typing import Dict, List, Optional, Tuple
from functools import lru_cache
import time

import config
from data_processor import data_processor
from lda_trainer import lda_trainer


class PredictionService:
    """
    Provides admission probability predictions using trained LDA models.
    Includes caching, interpretability, and graceful fallbacks.
    """
    
    def __init__(self):
        self.model_cache = {}
        self.cache_timestamps = {}
    
    def _is_cache_valid(self, college_id: int) -> bool:
        """Check if cached model is still valid."""
        if college_id not in self.cache_timestamps:
            return False
        age = time.time() - self.cache_timestamps[college_id]
        return age < config.MODEL_CACHE_TTL
    
    def _get_cached_model(self, college_id: int):
        """Get model from cache or load from disk."""
        if college_id in self.model_cache and self._is_cache_valid(college_id):
            return self.model_cache[college_id]
        
        model = lda_trainer.load_model(college_id)
        scaler = lda_trainer.load_scaler(college_id)
        metadata = lda_trainer.load_model_metadata(college_id)
        
        if model and scaler and metadata:
            self.model_cache[college_id] = (model, scaler, metadata)
            self.cache_timestamps[college_id] = time.time()
            return model, scaler, metadata
        
        return None, None, None

    def predict(self, student_profile: Dict, college: Dict) -> Dict:
        """
        Predict admission probability for a student at a specific college.
        
        Args:
            student_profile: Student's academic profile
            college: Target college information
            
        Returns:
            Prediction result with probability, category, and explanation
        """
        college_id = college.get('id')
        
        # Check if ML model exists
        model, scaler, metadata = self._get_cached_model(college_id)
        
        if model is None:
            # Fall back to rule-based prediction
            return self._rule_based_prediction(student_profile, college)
        
        try:
            # Prepare features
            features = data_processor.prepare_prediction_input(student_profile, college)
            
            # Get feature array in correct order
            feature_cols = metadata.get('feature_columns', config.FEATURE_COLUMNS)
            X = np.array([[features.get(col, 0) for col in feature_cols]])
            
            # Handle missing values
            X = np.nan_to_num(X, nan=0.0)
            
            # Scale and predict
            X_scaled = scaler.transform(X)
            probability = model.predict_proba(X_scaled)[0]
            
            # Get admission probability (class 1 = admitted)
            admit_prob = probability[1] if len(probability) > 1 else probability[0]
            
            # Calculate feature contributions
            contributions = self._calculate_contributions(
                X_scaled[0], model, feature_cols, metadata.get('feature_importance', {})
            )
            
            # Determine category
            category = self._categorize_chance(admit_prob, college.get('acceptance_rate'))
            
            # Calculate confidence based on model quality and data completeness
            confidence = self._calculate_confidence(metadata, features, student_profile)
            
            return {
                'success': True,
                'prediction_type': 'ml_lda',
                'probability': float(admit_prob),
                'percentage': round(admit_prob * 100),
                'category': category,
                'confidence': confidence,
                'confidence_level': self._confidence_level(confidence),
                'factors': contributions,
                'model_info': {
                    'version': metadata.get('version'),
                    'trained_at': metadata.get('trained_at'),
                    'accuracy': metadata.get('metrics', {}).get('accuracy'),
                    'sample_count': metadata.get('sample_count')
                }
            }
            
        except Exception as e:
            # Fall back to rule-based on any error
            result = self._rule_based_prediction(student_profile, college)
            result['fallback_reason'] = str(e)
            return result

    def _calculate_contributions(self, X_scaled: np.ndarray, model, 
                                feature_cols: List[str], 
                                importance: Dict) -> List[Dict]:
        """
        Calculate how each feature contributed to the prediction.
        Uses LDA coefficients and feature values.
        """
        contributions = []
        
        if hasattr(model, 'coef_') and len(model.coef_) > 0:
            coefs = model.coef_[0] if len(model.coef_.shape) > 1 else model.coef_
            
            for i, col in enumerate(feature_cols):
                if i >= len(coefs) or i >= len(X_scaled):
                    continue
                    
                contribution = float(coefs[i] * X_scaled[i])
                
                # Get human-readable name
                display_name = config.FEATURE_IMPORTANCE_NAMES.get(col, col.replace('_', ' ').title())
                
                # Determine impact direction
                if contribution > 0.1:
                    impact = 'positive'
                    impact_level = 'strong' if contribution > 0.3 else 'moderate'
                elif contribution < -0.1:
                    impact = 'negative'
                    impact_level = 'strong' if contribution < -0.3 else 'moderate'
                else:
                    impact = 'neutral'
                    impact_level = 'minimal'
                
                contributions.append({
                    'factor': display_name,
                    'contribution': round(contribution, 3),
                    'impact': impact,
                    'impact_level': impact_level,
                    'raw_importance': float(importance.get(col, 0))
                })
        
        # Sort by absolute contribution
        contributions.sort(key=lambda x: abs(x['contribution']), reverse=True)
        
        return contributions[:8]  # Return top 8 factors

    def _categorize_chance(self, probability: float, 
                          acceptance_rate: Optional[float] = None) -> str:
        """
        Categorize admission chance into Safety/Target/Reach.
        
        Categories:
        - Safety: >70% chance OR well above average applicant
        - Target: 30-70% chance
        - Reach: <30% chance OR highly selective school
        """
        # Adjust for college selectivity if known
        if acceptance_rate is not None and acceptance_rate < 15:
            # Very selective schools
            if probability >= 0.5:
                return 'Target'
            elif probability >= 0.25:
                return 'Reach'
            else:
                return 'Far Reach'
        
        if probability >= 0.7:
            return 'Safety'
        elif probability >= 0.4:
            return 'Target'
        elif probability >= 0.2:
            return 'Reach'
        else:
            return 'Far Reach'

    def _calculate_confidence(self, metadata: Dict, features: Dict, 
                            student_profile: Dict) -> float:
        """
        Calculate confidence in the prediction.
        
        Factors:
        - Model accuracy
        - Sample size
        - Profile completeness
        """
        confidence = 0.5  # Base confidence
        
        # Model accuracy contribution (0-30%)
        accuracy = metadata.get('metrics', {}).get('accuracy', 0.5)
        confidence += (accuracy - 0.5) * 0.6  # Max 0.3 boost
        
        # Sample size contribution (0-20%)
        sample_count = metadata.get('sample_count', 0)
        if sample_count >= 1000:
            confidence += 0.2
        elif sample_count >= 500:
            confidence += 0.15
        elif sample_count >= 100:
            confidence += 0.1
        elif sample_count >= 50:
            confidence += 0.05
        
        # Profile completeness (0-20%)
        complete_fields = sum(1 for k, v in features.items() 
                             if v is not None and v != 0)
        completeness = complete_fields / len(features)
        confidence += completeness * 0.2
        
        return min(max(confidence, 0.1), 0.95)  # Clamp to 10-95%

    def _confidence_level(self, confidence: float) -> str:
        """Convert confidence score to level description."""
        if confidence >= 0.8:
            return 'high'
        elif confidence >= 0.6:
            return 'medium'
        else:
            return 'low'

    def _rule_based_prediction(self, student_profile: Dict, college: Dict) -> Dict:
        """
        Fallback rule-based prediction when no ML model is available.
        Uses a weighted scoring system based on key metrics.
        """
        score = 50  # Base score
        factors = []
        
        acceptance_rate = college.get('acceptance_rate', 50)
        
        # GPA impact (25% weight)
        gpa = student_profile.get('gpa_unweighted') or student_profile.get('gpa_weighted')
        avg_gpa = college.get('average_gpa', 3.5)
        if gpa:
            gpa_diff = gpa - avg_gpa
            if gpa_diff >= 0.3:
                score += 12
                factors.append({'factor': 'GPA', 'impact': 'positive', 
                              'details': f'{gpa:.2f} is above average'})
            elif gpa_diff >= 0:
                score += 5
                factors.append({'factor': 'GPA', 'impact': 'positive', 
                              'details': f'{gpa:.2f} matches college profile'})
            elif gpa_diff >= -0.3:
                score -= 5
                factors.append({'factor': 'GPA', 'impact': 'neutral', 
                              'details': f'{gpa:.2f} is slightly below average'})
            else:
                score -= 10
                factors.append({'factor': 'GPA', 'impact': 'negative', 
                              'details': f'{gpa:.2f} is below average'})
        
        # Test score impact (25% weight)
        sat = student_profile.get('sat_total')
        act = student_profile.get('act_composite')
        if sat or act:
            test_pct = data_processor.get_test_score_percentile(sat, act)
            if test_pct >= 90:
                score += 15
                factors.append({'factor': 'Test Scores', 'impact': 'positive',
                              'details': 'Excellent test scores'})
            elif test_pct >= 75:
                score += 8
                factors.append({'factor': 'Test Scores', 'impact': 'positive',
                              'details': 'Strong test scores'})
            elif test_pct >= 50:
                score += 0
                factors.append({'factor': 'Test Scores', 'impact': 'neutral',
                              'details': 'Average test scores'})
            else:
                score -= 8
                factors.append({'factor': 'Test Scores', 'impact': 'negative',
                              'details': 'Test scores below average'})
        
        # Activities (15% weight)
        tier1 = student_profile.get('activity_tier1_count', 0)
        tier2 = student_profile.get('activity_tier2_count', 0)
        if tier1 >= 2:
            score += 10
            factors.append({'factor': 'Extracurriculars', 'impact': 'positive',
                          'details': 'National/international achievements'})
        elif tier1 >= 1 or tier2 >= 2:
            score += 5
            factors.append({'factor': 'Extracurriculars', 'impact': 'positive',
                          'details': 'Strong leadership and achievements'})
        
        # Hooks (10% weight)
        if student_profile.get('is_legacy'):
            score += 8
            factors.append({'factor': 'Legacy', 'impact': 'positive',
                          'details': 'Legacy applicant advantage'})
        
        if student_profile.get('is_first_generation'):
            score += 3
            factors.append({'factor': 'First Generation', 'impact': 'positive',
                          'details': 'First-gen consideration'})
        
        # Selectivity adjustment
        if acceptance_rate < 10:
            score = score * 0.6
        elif acceptance_rate < 20:
            score = score * 0.75
        elif acceptance_rate < 30:
            score = score * 0.85
        
        # Normalize to 0-100
        probability = max(min(score, 95), 5) / 100
        
        return {
            'success': True,
            'prediction_type': 'rule_based',
            'probability': probability,
            'percentage': round(probability * 100),
            'category': self._categorize_chance(probability, acceptance_rate),
            'confidence': 0.4,  # Lower confidence for rule-based
            'confidence_level': 'low',
            'factors': factors,
            'model_info': {
                'note': 'ML model not available. Using rule-based estimation.',
                'reason': f'Insufficient training data. Needs at least {config.MIN_SAMPLES_FOR_TRAINING} samples with {config.MIN_SAMPLES_PER_CLASS} accepted and {config.MIN_SAMPLES_PER_CLASS} rejected outcomes.'
            }
        }

    def batch_predict(self, student_profile: Dict, 
                     colleges: List[Dict]) -> List[Dict]:
        """
        Predict admission chances for multiple colleges.
        
        Args:
            student_profile: Student's academic profile
            colleges: List of target colleges
            
        Returns:
            List of predictions sorted by probability
        """
        predictions = []
        
        for college in colleges:
            prediction = self.predict(student_profile, college)
            prediction['college'] = {
                'id': college.get('id'),
                'name': college.get('name'),
                'acceptance_rate': college.get('acceptance_rate')
            }
            predictions.append(prediction)
        
        # Sort by probability descending
        predictions.sort(key=lambda x: x.get('probability', 0), reverse=True)
        
        return predictions

    def clear_cache(self, college_id: Optional[int] = None):
        """Clear model cache."""
        if college_id:
            self.model_cache.pop(college_id, None)
            self.cache_timestamps.pop(college_id, None)
        else:
            self.model_cache.clear()
            self.cache_timestamps.clear()


# Singleton instance
prediction_service = PredictionService()
