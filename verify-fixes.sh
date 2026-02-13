#!/bin/bash

# CollegeOS Week 1 Fixes Verification Script
# Run this to verify all critical fixes are working

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  CollegeOS Week 1 Critical Fixes - Verification Script        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Backend URL
BACKEND_URL="http://localhost:5000"

# Test counters
PASSED=0
FAILED=0

# Helper function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=$4
    local auth=$5
    
    echo -n "Testing $name... "
    
    if [ -n "$auth" ]; then
        if [ "$method" = "POST" ]; then
            response=$(curl -s -w "\n%{http_code}" -X POST "$url" -H "Content-Type: application/json" -H "Authorization: Bearer $auth" -d "$data" 2>/dev/null)
        else
            response=$(curl -s -w "\n%{http_code}" -X GET "$url" -H "Authorization: Bearer $auth" 2>/dev/null)
        fi
    else
        if [ "$method" = "POST" ]; then
            response=$(curl -s -w "\n%{http_code}" -X POST "$url" -H "Content-Type: application/json" -d "$data" 2>/dev/null)
        else
            response=$(curl -s -w "\n%{http_code}" -X GET "$url" 2>/dev/null)
        fi
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code)"
        echo "  Response: $body"
        ((FAILED++))
        return 1
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. BACKEND SERVER CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if backend is running
echo -n "Checking if backend is running... "
if curl -s "$BACKEND_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is running${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ Backend is not running${NC}"
    echo ""
    echo "Please start the backend server first:"
    echo "  cd backend && node src/app.js"
    echo ""
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. AUTHENTICATION SYSTEM TESTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Generate random email for testing
TEST_EMAIL="test_$(date +%s)@example.com"
TEST_PASSWORD="Password123"

# Test registration
echo -n "Testing user registration... "
register_response=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"fullName\":\"Test User\",\"country\":\"USA\"}" 2>/dev/null)

register_http_code=$(echo "$register_response" | tail -n1)
register_body=$(echo "$register_response" | head -n-1)

if [ "$register_http_code" = "201" ]; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
    
    # Extract access token
    ACCESS_TOKEN=$(echo "$register_body" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['tokens']['accessToken'])" 2>/dev/null)
    REFRESH_TOKEN=$(echo "$register_body" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['tokens']['refreshToken'])" 2>/dev/null)
    
    if [ -n "$ACCESS_TOKEN" ]; then
        echo "  ✓ Access token received"
    fi
    if [ -n "$REFRESH_TOKEN" ]; then
        echo "  ✓ Refresh token received"
    fi
else
    echo -e "${RED}✗ FAILED${NC} (HTTP $register_http_code)"
    echo "  Response: $register_body"
    ((FAILED++))
    ACCESS_TOKEN=""
fi

# Test protected endpoint with token
if [ -n "$ACCESS_TOKEN" ]; then
    test_endpoint "Protected endpoint (/api/auth/me)" "$BACKEND_URL/api/auth/me" "GET" "" "$ACCESS_TOKEN"
fi

# Test login
test_endpoint "User login" "$BACKEND_URL/api/auth/login" "POST" "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. DATABASE & COLLEGE DATA TESTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test college list
test_endpoint "College list endpoint" "$BACKEND_URL/api/colleges?limit=5"

# Test college search
test_endpoint "College search (Duke)" "$BACKEND_URL/api/colleges/search?q=Duke"

# Test college by ID (Duke = 1686)
test_endpoint "College by ID (Duke)" "$BACKEND_URL/api/colleges/1686"

# Test college majors
test_endpoint "College majors (Duke)" "$BACKEND_URL/api/colleges/1686/majors"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. DEADLINES & ESSAYS TESTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -n "$ACCESS_TOKEN" ]; then
    test_endpoint "Deadlines endpoint" "$BACKEND_URL/api/deadlines" "GET" "" "$ACCESS_TOKEN"
    test_endpoint "Essays endpoint" "$BACKEND_URL/api/essays" "GET" "" "$ACCESS_TOKEN"
else
    echo -e "${YELLOW}⚠ Skipping (no access token)${NC}"
    echo "  Deadlines endpoint - SKIPPED"
    echo "  Essays endpoint - SKIPPED"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. DATABASE VERIFICATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -f "backend/database/college_app.db" ]; then
    echo -e "${GREEN}✓ Database file exists${NC}"
    ((PASSED++))
    
    # Check table counts
    echo ""
    echo "Database statistics:"
    sqlite3 backend/database/college_app.db << EOF
.mode line
SELECT 'Colleges: ' || COUNT(*) FROM colleges;
SELECT 'Master Majors: ' || COUNT(*) FROM master_majors;
SELECT 'College-Major Mappings: ' || COUNT(*) FROM college_majors_offered;
SELECT 'Users: ' || COUNT(*) FROM users;
EOF
else
    echo -e "${RED}✗ Database file not found${NC}"
    echo "  Expected: backend/database/college_app.db"
    ((FAILED++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. ENVIRONMENT CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -f "backend/.env" ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
    ((PASSED++))
    
    # Check for critical variables
    if grep -q "JWT_SECRET=" backend/.env && ! grep -q "JWT_SECRET=your-secret" backend/.env; then
        echo "  ✓ JWT_SECRET is set"
    else
        echo -e "  ${YELLOW}⚠ JWT_SECRET not properly configured${NC}"
    fi
    
    if grep -q "REFRESH_TOKEN_SECRET=" backend/.env && ! grep -q "REFRESH_TOKEN_SECRET=your-refresh" backend/.env; then
        echo "  ✓ REFRESH_TOKEN_SECRET is set"
    else
        echo -e "  ${YELLOW}⚠ REFRESH_TOKEN_SECRET not properly configured${NC}"
    fi
else
    echo -e "${RED}✗ .env file not found${NC}"
    echo "  Expected: backend/.env"
    ((FAILED++))
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                      TEST RESULTS                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Tests Passed:  ${GREEN}$PASSED${NC}"
echo -e "Tests Failed:  ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓✓✓ ALL TESTS PASSED ✓✓✓${NC}"
    echo ""
    echo "Week 1 critical fixes are working correctly!"
    echo ""
    echo "Next steps:"
    echo "  1. Review WEEK_1_COMPLETION_SUMMARY.md for full details"
    echo "  2. Start frontend development server: npm run dev"
    echo "  3. Begin Week 2 feature development"
    echo ""
    exit 0
else
    echo -e "${RED}✗✗✗ SOME TESTS FAILED ✗✗✗${NC}"
    echo ""
    echo "Please review the failures above and check:"
    echo "  1. Backend server is running (node src/app.js)"
    echo "  2. Database is properly seeded (npm run migrate && npm run seed)"
    echo "  3. .env file has correct configuration"
    echo ""
    exit 1
fi
