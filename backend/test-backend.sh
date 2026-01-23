#!/bin/bash
# Test backend endpoints

echo "======================================"
echo "CollegeOS Backend Test Script"
echo "======================================"
echo ""

BASE_URL="http://localhost:5000"

echo "1. Testing Health Check..."
curl -s "$BASE_URL/health" | head -c 200
echo -e "\n"

echo "2. Testing Colleges Endpoint (first 3)..."
curl -s "$BASE_URL/api/colleges?limit=3" | head -c 500
echo -e "\n"

echo "3. Testing Search Endpoint..."
curl -s "$BASE_URL/api/colleges/search?q=MIT" | head -c 500
echo -e "\n"

echo "4. Testing Intelligent Search..."
curl -s -X POST "$BASE_URL/api/intelligent-search" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is Studielink?"}' | head -c 500
echo -e "\n"

echo "5. Testing Chatbot..."
curl -s -X POST "$BASE_URL/api/chatbot/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}' | head -c 200
echo -e "\n"

echo "======================================"
echo "Test Complete"
echo "======================================"
echo ""
echo "If you see JSON responses above, backend is working!"
echo "If you see errors, make sure to run: npm start"
