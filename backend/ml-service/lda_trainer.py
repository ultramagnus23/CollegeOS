# backend/ml-service/lda_trainer.py
# LDA Model Training Pipeline for Admission Prediction

import os
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

import config
from data_processor import data_processor


class LDATrainer:
    """
    Trains and manages LDA models for college admission prediction.
    One model is trained per college using historical admission data.
    """
    
    def __init__(self):
        self.models = {}  # Cache of loaded models
        self.scalers = {}  # Cache of scalers
        os.makedirs(config.MODEL_DIR, exist_ok=True)
        os.makedirs(config.DATA_DIR, exist_ok=True)

    def _get_model_path(self, college_id: int) -> str:
        """Get the file path for a college's model."""
        return os.path.join(config.MODEL_DIR, f'lda_college_{college_id}.joblib')

    def _get_scaler_path(self, college_id: int) -> str:
        """Get the file path for a college's scaler."""
        return os.path.join(config.MODEL_DIR, f'scaler_college_{college_id}.joblib')

    def _get_metadata_path(self, college_id: int) -> str:
        """Get the file path for a college's model metadata."""
        return os.path.join(config.MODEL_DIR, f'metadata_college_{college_id}.json')

    def check_training_readiness(self, college_data: pd.DataFrame) -> Tuple[bool, str]:
        """
        Check if there's enough data to train a model.
        
        Returns:
            (is_ready, reason_message)
        """
        if len(college_data) < config.MIN_SAMPLES_FOR_TRAINING:
            return False, f'Insufficient samples: {len(college_data)} < {config.MIN_SAMPLES_FOR_TRAINING}'
        
        # Check class balance
        admitted_count = college_data['admitted'].sum()
        rejected_count = len(college_data) - admitted_count
        
        if admitted_count < config.MIN_SAMPLES_PER_CLASS:
            return False, f'Insufficient accepted samples: {admitted_count} < {config.MIN_SAMPLES_PER_CLASS}'
        
        if rejected_count < config.MIN_SAMPLES_PER_CLASS:
            return False, f'Insufficient rejected samples: {rejected_count} < {config.MIN_SAMPLES_PER_CLASS}'
        
        return True, 'Ready for training'

    def train_model(self, college_id: int, training_data: List[Dict], 
                   force: bool = False) -> Dict:
        """
        Train an LDA model for a specific college.
        
        Args:
            college_id: The college ID
            training_data: List of admission outcome records
            force: Force retraining even if model exists
            
        Returns:
            Training results with metrics
        """
        # Check if model already exists and is recent
        if not force and os.path.exists(self._get_model_path(college_id)):
            metadata = self.load_model_metadata(college_id)
            if metadata:
                days_old = (datetime.now() - datetime.fromisoformat(metadata['trained_at'])).days
                if days_old < config.MODEL_FRESHNESS_DAYS:
                    return {
                        'success': False,
                        'message': f'Model is only {days_old} days old. Use force=True to retrain.',
                        'college_id': college_id
                    }
        
        # Process data
        df = data_processor.prepare_training_data(training_data)
        
        # Filter for this college
        college_data = df[df['college_id'] == college_id].copy()
        
        # Check readiness
        is_ready, message = self.check_training_readiness(college_data)
        if not is_ready:
            return {
                'success': False,
                'message': message,
                'college_id': college_id,
                'sample_count': len(college_data)
            }
        
        # Prepare features and labels
        feature_cols = [col for col in config.FEATURE_COLUMNS if col in college_data.columns]
        X = college_data[feature_cols].values
        y = college_data['admitted'].values
        
        # Split data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, 
            test_size=config.VALIDATION_SPLIT, 
            random_state=42,
            stratify=y
        )
        
        # Scale features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_val_scaled = scaler.transform(X_val)
        
        # Train LDA model
        lda = LinearDiscriminantAnalysis()
        lda.fit(X_train_scaled, y_train)
        
        # Evaluate
        y_pred = lda.predict(X_val_scaled)
        y_prob = lda.predict_proba(X_val_scaled)
        
        accuracy = accuracy_score(y_val, y_pred)
        precision = precision_score(y_val, y_pred, zero_division=0)
        recall = recall_score(y_val, y_pred, zero_division=0)
        f1 = f1_score(y_val, y_pred, zero_division=0)
        
        # Cross-validation
        X_scaled = scaler.transform(X)
        cv_scores = cross_val_score(lda, X_scaled, y, cv=min(config.CV_FOLDS, len(y) // 2))
        cv_mean = cv_scores.mean()
        cv_std = cv_scores.std()
        
        # Check if model meets quality threshold
        if accuracy < config.MIN_ACCURACY_THRESHOLD:
            return {
                'success': False,
                'message': f'Model accuracy {accuracy:.2%} below threshold {config.MIN_ACCURACY_THRESHOLD:.2%}',
                'college_id': college_id,
                'metrics': {
                    'accuracy': accuracy,
                    'precision': precision,
                    'recall': recall,
                    'f1': f1,
                    'cv_mean': cv_mean,
                    'cv_std': cv_std
                }
            }
        
        # Save model and scaler
        joblib.dump(lda, self._get_model_path(college_id))
        joblib.dump(scaler, self._get_scaler_path(college_id))
        
        # Calculate feature importances from LDA coefficients
        feature_importance = {}
        if hasattr(lda, 'coef_') and lda.coef_.shape[0] > 0:
            coefs = lda.coef_[0] if len(lda.coef_.shape) > 1 else lda.coef_
            for i, col in enumerate(feature_cols):
                if i < len(coefs):
                    feature_importance[col] = float(coefs[i])
        
        # Save metadata
        metadata = {
            'college_id': college_id,
            'trained_at': datetime.now().isoformat(),
            'version': self._get_next_version(college_id),
            'sample_count': len(college_data),
            'accepted_count': int(y.sum()),
            'rejected_count': int(len(y) - y.sum()),
            'class_balance': float(y.mean()),
            'feature_columns': feature_cols,
            'metrics': {
                'accuracy': float(accuracy),
                'precision': float(precision),
                'recall': float(recall),
                'f1': float(f1),
                'cv_mean': float(cv_mean),
                'cv_std': float(cv_std)
            },
            'feature_importance': feature_importance,
            'is_deployed': True
        }
        
        with open(self._get_metadata_path(college_id), 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Update cache
        self.models[college_id] = lda
        self.scalers[college_id] = scaler
        
        return {
            'success': True,
            'message': 'Model trained and deployed successfully',
            'college_id': college_id,
            **metadata
        }

    def _get_next_version(self, college_id: int) -> str:
        """Get the next version number for a college's model."""
        existing = self.load_model_metadata(college_id)
        if existing and 'version' in existing:
            parts = existing['version'].split('.')
            try:
                major, minor = int(parts[0]), int(parts[1])
                return f'{major}.{minor + 1}'
            except (ValueError, IndexError):
                pass
        return '1.0'

    def load_model(self, college_id: int) -> Optional[LinearDiscriminantAnalysis]:
        """Load a trained model for a college."""
        if college_id in self.models:
            return self.models[college_id]
        
        model_path = self._get_model_path(college_id)
        if os.path.exists(model_path):
            model = joblib.load(model_path)
            self.models[college_id] = model
            return model
        
        return None

    def load_scaler(self, college_id: int) -> Optional[StandardScaler]:
        """Load the scaler for a college's model."""
        if college_id in self.scalers:
            return self.scalers[college_id]
        
        scaler_path = self._get_scaler_path(college_id)
        if os.path.exists(scaler_path):
            scaler = joblib.load(scaler_path)
            self.scalers[college_id] = scaler
            return scaler
        
        return None

    def load_model_metadata(self, college_id: int) -> Optional[Dict]:
        """Load metadata for a college's model."""
        metadata_path = self._get_metadata_path(college_id)
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                return json.load(f)
        return None

    def model_exists(self, college_id: int) -> bool:
        """Check if a model exists for a college."""
        return os.path.exists(self._get_model_path(college_id))

    def list_models(self) -> List[Dict]:
        """List all available trained models."""
        models = []
        if os.path.exists(config.MODEL_DIR):
            for filename in os.listdir(config.MODEL_DIR):
                if filename.startswith('metadata_college_') and filename.endswith('.json'):
                    college_id = int(filename.replace('metadata_college_', '').replace('.json', ''))
                    metadata = self.load_model_metadata(college_id)
                    if metadata:
                        models.append(metadata)
        return sorted(models, key=lambda x: x.get('college_id', 0))

    def delete_model(self, college_id: int) -> bool:
        """Delete a college's model and associated files."""
        deleted = False
        
        for path in [self._get_model_path(college_id),
                    self._get_scaler_path(college_id),
                    self._get_metadata_path(college_id)]:
            if os.path.exists(path):
                os.remove(path)
                deleted = True
        
        # Clear from cache
        self.models.pop(college_id, None)
        self.scalers.pop(college_id, None)
        
        return deleted

    def get_training_stats(self) -> Dict:
        """Get overall training statistics."""
        models = self.list_models()
        
        if not models:
            return {
                'total_models': 0,
                'total_samples': 0,
                'average_accuracy': 0,
                'models_by_quality': {'high': 0, 'medium': 0, 'low': 0}
            }
        
        total_samples = sum(m.get('sample_count', 0) for m in models)
        accuracies = [m.get('metrics', {}).get('accuracy', 0) for m in models]
        avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0
        
        quality_counts = {'high': 0, 'medium': 0, 'low': 0}
        for acc in accuracies:
            if acc >= 0.75:
                quality_counts['high'] += 1
            elif acc >= 0.6:
                quality_counts['medium'] += 1
            else:
                quality_counts['low'] += 1
        
        return {
            'total_models': len(models),
            'total_samples': total_samples,
            'average_accuracy': avg_accuracy,
            'models_by_quality': quality_counts,
            'oldest_model': min(m.get('trained_at', '') for m in models) if models else None,
            'newest_model': max(m.get('trained_at', '') for m in models) if models else None
        }


# Singleton instance
lda_trainer = LDATrainer()
