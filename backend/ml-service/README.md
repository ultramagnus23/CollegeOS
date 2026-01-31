# CollegeOS ML Prediction Service

This service provides LDA-based admission probability predictions for the CollegeOS application.

## Overview

The ML Prediction Service uses Linear Discriminant Analysis (LDA) to predict a student's probability of admission to specific colleges based on historical admission data. The system continuously improves as more real admission outcomes are collected.

## Features

- **LDA-based Predictions**: Uses scikit-learn's LinearDiscriminantAnalysis for admission probability
- **Per-College Models**: Trains a separate model for each college with sufficient data
- **Automatic Retraining**: Monthly retraining with new data
- **Interpretable Results**: Shows which factors most influenced the prediction
- **Fallback System**: Uses rule-based estimation when ML model unavailable
- **Data Quality Scoring**: Filters and weights training data by confidence

## Quick Start

### Prerequisites
- Python 3.8+
- pip

### Installation

```bash
cd backend/ml-service

# Create virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Running the Service

```bash
# Using the start script
./start.sh

# Or manually
python app.py
```

The service will start on port 5050 by default.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| ML_SERVICE_HOST | 127.0.0.1 | Host to bind to |
| ML_SERVICE_PORT | 5050 | Port to listen on |
| ML_MODEL_DIR | ./models | Directory for trained models |
| ML_DATA_DIR | ./data | Directory for training data |
| MIN_SAMPLES_FOR_TRAINING | 30 | Minimum samples to train a model |
| MIN_ACCURACY_THRESHOLD | 0.55 | Minimum accuracy for model deployment |

## API Endpoints

### Health Check
```
GET /health
```

### Predict Admission Probability
```
POST /api/predict
{
  "student_profile": { ... },
  "college": { ... }
}
```

### Batch Predictions
```
POST /api/predict/batch
{
  "student_profile": { ... },
  "colleges": [ ... ]
}
```

### Train Model
```
POST /api/train
{
  "college_id": 123,
  "training_data": [ ... ],
  "force": false
}
```

### List Models
```
GET /api/models
```

### Get Model Info
```
GET /api/models/:collegeId
```

### Get Statistics
```
GET /api/stats
```

## Architecture

```
ml-service/
├── app.py                    # Flask API server
├── config.py                 # Configuration settings
├── data_processor.py         # Data normalization & cleaning
├── lda_trainer.py            # LDA model training
├── prediction_service.py     # Prediction with caching
├── retraining_scheduler.py   # Automated retraining
├── requirements.txt          # Python dependencies
├── models/                   # Trained model storage
├── data/                     # Training data storage
└── tests/                    # Unit tests
```

## Data Flow

1. **Data Collection**: User outcomes and scraped data are stored in SQLite
2. **Data Processing**: Normalization, cleaning, confidence scoring
3. **Model Training**: LDA classifier per college with validation
4. **Prediction**: Feature engineering → scaling → LDA prediction
5. **Interpretation**: LDA coefficients explain factor contributions

## Model Training

Models are trained when:
- College has ≥30 samples (≥10 accepted, ≥10 rejected)
- Data confidence score ≥0.5
- Model accuracy ≥55%

Training produces:
- LDA model (joblib)
- Feature scaler (joblib)
- Metadata (JSON)

## Contributing

When users submit their admission outcomes, the data is:
1. Validated and scored for quality
2. Added to training dataset with high confidence
3. Used in next model retraining cycle

Users earn points for contributions to encourage data sharing.

## Testing

```bash
cd backend/ml-service
python -m pytest tests/ -v
```
