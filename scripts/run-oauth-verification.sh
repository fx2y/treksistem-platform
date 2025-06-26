#!/bin/bash

# OAuth 2.0 Production Verification Script
# Runs comprehensive verification suite for Spec_013_Enhanced

set -e

echo "🎯 Starting OAuth 2.0 Production Verification Suite"
echo "=================================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check Node.js version
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_status "Node.js $NODE_VERSION found"
else
    print_error "Node.js not found. Please install Node.js >=18.0.0"
    exit 1
fi

# Check PNPM
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    print_status "PNPM $PNPM_VERSION found"
else
    print_error "PNPM not found. Please install PNPM >=9.0.0"
    exit 1
fi

# Install dependencies if needed
echo ""
echo "📦 Installing dependencies..."
pnpm install --silent

# Run OAuth verification tests
echo ""
echo "🧪 Running OAuth verification test suite..."
echo ""

# Set test environment variables
export NODE_ENV=test
export JWT_SECRET=test-jwt-secret-key-minimum-32-characters-long
export GOOGLE_CLIENT_ID=test-google-client-id
export CSRF_SECRET=test-csrf-secret-key

# Run the OAuth verification tests
TEST_START_TIME=$(date +%s)

if pnpm test:oauth; then
    TEST_END_TIME=$(date +%s)
    TEST_DURATION=$((TEST_END_TIME - TEST_START_TIME))
    
    echo ""
    echo "🎉 OAuth Verification Suite COMPLETED SUCCESSFULLY"
    echo "=================================================="
    echo ""
    print_status "All verification tests passed"
    print_status "Test execution time: ${TEST_DURATION} seconds"
    print_status "Verification summary available at: .ai/verification-results/oauth-verification-summary.md"
    
    echo ""
    echo "📊 Verification Results Summary:"
    echo "  • Core Authentication Flow: ✅ VERIFIED"
    echo "  • Security Validation: ✅ VERIFIED" 
    echo "  • Performance Requirements: ✅ VERIFIED"
    echo "  • Database Integration: ✅ VERIFIED"
    echo "  • Error Handling: ✅ VERIFIED"
    
    echo ""
    echo "🚀 System Status: READY FOR PRODUCTION"
    echo ""
    echo "📋 Next Steps:"
    echo "  1. Deploy to staging environment"
    echo "  2. Configure production secrets"
    echo "  3. Set up monitoring dashboard"
    echo "  4. Perform manual browser testing"
    
    exit 0
else
    TEST_END_TIME=$(date +%s)
    TEST_DURATION=$((TEST_END_TIME - TEST_START_TIME))
    
    echo ""
    print_error "OAuth Verification Suite FAILED"
    echo "=================================="
    echo ""
    print_error "Some verification tests failed"
    print_warning "Test execution time: ${TEST_DURATION} seconds"
    print_warning "Review test output above for details"
    
    echo ""
    echo "🔧 Troubleshooting:"
    echo "  1. Check test output for specific failures"
    echo "  2. Ensure all dependencies are installed"
    echo "  3. Verify test environment configuration"
    echo "  4. Run individual test suites for debugging"
    
    echo ""
    echo "📝 Debug Commands:"
    echo "  pnpm test:oauth --reporter=verbose"
    echo "  pnpm test test/oauth/oauth-verification-suite.test.ts"
    echo "  pnpm test test/oauth/oauth-database-integration.test.ts"
    echo "  pnpm test test/oauth/oauth-api-integration.test.ts"
    
    exit 1
fi