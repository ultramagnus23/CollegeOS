#!/bin/bash
# backend/ml-service/start.sh
# Script to start the ML prediction service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment (POSIX-compatible)
. venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Create directories
mkdir -p models data

# Start the service
echo "Starting ML Prediction Service on port ${ML_SERVICE_PORT:-5050}..."
python app.py
