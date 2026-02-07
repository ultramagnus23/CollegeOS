# backend/ml-service/app.py
# Flask API for ML Prediction Service

import os
import sys
from flask import Flask, request, jsonify
from datetime import datetime

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
from prediction_service import prediction_service
from lda_trainer import lda_trainer
from data_processor import data_processor

app = Flask(__name__)


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'ml-prediction-service',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/predict', methods=['POST'])
def predict():
    """
    Predict admission probability for a student at a specific college.
    
    Request body:
    {
        "student_profile": { ... },
        "college": { "id": 123, ... }
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body required'}), 400
        
        student_profile = data.get('student_profile')
        college = data.get('college')
        
        if not student_profile or not college:
            return jsonify({'error': 'student_profile and college required'}), 400
        
        # Validate that college id is an integer to prevent path manipulation
        college_id = college.get('id')
        try:
            college_id_int = int(college_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'college.id must be an integer'}), 400
        
        # Use the validated integer id in the college dict
        college = dict(college)
        college['id'] = college_id_int
        
        result = prediction_service.predict(student_profile, college)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/predict/batch', methods=['POST'])
def batch_predict():
    """
    Predict admission probabilities for multiple colleges.
    
    Request body:
    {
        "student_profile": { ... },
        "colleges": [ ... ]
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body required'}), 400
        
        student_profile = data.get('student_profile')
        colleges = data.get('colleges', [])
        
        if not student_profile:
            return jsonify({'error': 'student_profile required'}), 400
        
        if not colleges:
            return jsonify({'error': 'colleges array required'}), 400
        
        results = prediction_service.batch_predict(student_profile, colleges)
        return jsonify({
            'success': True,
            'predictions': results,
            'count': len(results)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/train', methods=['POST'])
def train_model():
    """
    Train an LDA model for a specific college.
    
    Request body:
    {
        "college_id": 123,
        "training_data": [ ... ],
        "force": false
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body required'}), 400
        
        college_id = data.get('college_id')
        training_data = data.get('training_data', [])
        force = data.get('force', False)
        
        if not college_id:
            return jsonify({'error': 'college_id required'}), 400
        
        if not training_data:
            return jsonify({'error': 'training_data required'}), 400
        
        result = lda_trainer.train_model(college_id, training_data, force=force)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/models', methods=['GET'])
def list_models():
    """List all trained models."""
    try:
        models = lda_trainer.list_models()
        stats = lda_trainer.get_training_stats()
        
        return jsonify({
            'success': True,
            'models': models,
            'stats': stats
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/models/<int:college_id>', methods=['GET'])
def get_model(college_id):
    """Get information about a specific model."""
    try:
        if not lda_trainer.model_exists(college_id):
            return jsonify({
                'success': False,
                'message': f'No model found for college {college_id}'
            }), 404
        
        metadata = lda_trainer.load_model_metadata(college_id)
        return jsonify({
            'success': True,
            'model': metadata
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/models/<int:college_id>', methods=['DELETE'])
def delete_model(college_id):
    """Delete a model."""
    try:
        deleted = lda_trainer.delete_model(college_id)
        prediction_service.clear_cache(college_id)
        
        return jsonify({
            'success': deleted,
            'message': f'Model {"deleted" if deleted else "not found"} for college {college_id}'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/models/check-readiness', methods=['POST'])
def check_training_readiness():
    """
    Check if a college has enough data for model training.
    
    Request body:
    {
        "college_id": 123,
        "training_data": [ ... ]
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body required'}), 400
        
        college_id = data.get('college_id')
        training_data = data.get('training_data', [])
        
        if not college_id:
            return jsonify({'error': 'college_id required'}), 400
        
        # Process data
        df = data_processor.prepare_training_data(training_data)
        college_data = df[df['college_id'] == college_id]
        
        is_ready, message = lda_trainer.check_training_readiness(college_data)
        
        return jsonify({
            'success': True,
            'is_ready': is_ready,
            'message': message,
            'sample_count': len(college_data),
            'accepted_count': int(college_data['admitted'].sum()) if len(college_data) > 0 else 0,
            'rejected_count': len(college_data) - int(college_data['admitted'].sum()) if len(college_data) > 0 else 0
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clear prediction cache."""
    try:
        college_id = request.get_json().get('college_id') if request.get_json() else None
        prediction_service.clear_cache(college_id)
        
        return jsonify({
            'success': True,
            'message': f'Cache cleared for {"college " + str(college_id) if college_id else "all models"}'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get ML service statistics."""
    try:
        stats = lda_trainer.get_training_stats()
        
        return jsonify({
            'success': True,
            'stats': stats,
            'config': {
                'min_samples_for_training': config.MIN_SAMPLES_FOR_TRAINING,
                'min_accuracy_threshold': config.MIN_ACCURACY_THRESHOLD,
                'feature_count': len(config.FEATURE_COLUMNS)
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Ensure directories exist
    os.makedirs(config.MODEL_DIR, exist_ok=True)
    os.makedirs(config.DATA_DIR, exist_ok=True)
    
    app.run(
        host=config.SERVICE_HOST,
        port=config.SERVICE_PORT,
        debug=config.DEBUG_MODE
    )
