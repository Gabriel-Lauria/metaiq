#!/bin/bash

# Pre-Deploy Checklist for MetaIQ Frontend
# Execute this before deploying to production

echo "=== MetaIQ Frontend Pre-Deploy Checklist ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_passed() {
  echo -e "${GREEN}✓${NC} $1"
}

check_failed() {
  echo -e "${RED}✗${NC} $1"
}

check_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Dependencies Check
echo "1. Checking Dependencies..."
if npm list @angular/core > /dev/null 2>&1; then
  check_passed "Angular dependencies installed"
else
  check_failed "Angular dependencies NOT installed"
  echo "  Run: npm install"
fi
echo ""

# 2. Build Check
echo "2. Building project..."
if npm run build > /dev/null 2>&1; then
  check_passed "Build successful (development)"
else
  check_failed "Build failed"
  exit 1
fi
echo ""

# 3. Production Build Check
echo "3. Building for production..."
if npm run build:prod > /dev/null 2>&1; then
  check_passed "Production build successful"
else
  check_failed "Production build failed"
  exit 1
fi
echo ""

# 4. Bundle Size Check
echo "4. Checking bundle size..."
BUNDLE_SIZE=$(stat -f%z "dist/metaiq-frontend/main.*.js" 2>/dev/null | head -1)
if [ -n "$BUNDLE_SIZE" ]; then
  SIZE_KB=$((BUNDLE_SIZE / 1024))
  if [ $SIZE_KB -lt 500 ]; then
    check_passed "Bundle size: ${SIZE_KB}KB (under 500KB limit)"
  else
    check_warning "Bundle size: ${SIZE_KB}KB (consider optimization)"
  fi
else
  check_warning "Could not determine bundle size"
fi
echo ""

# 5. TypeScript Check
echo "5. TypeScript Type Checking..."
if npx tsc --noEmit > /dev/null 2>&1; then
  check_passed "No TypeScript errors"
else
  check_failed "TypeScript errors found"
  npx tsc --noEmit | head -20
fi
echo ""

# 6. Linting
echo "6. ESLint Check..."
if npm run lint > /dev/null 2>&1; then
  check_passed "No linting errors"
else
  check_warning "Linting issues found (non-critical)"
fi
echo ""

# 7. Tests
echo "7. Running Tests..."
if npm test -- --watch=false > /dev/null 2>&1; then
  check_passed "Tests passed"
else
  check_warning "Tests failed or not configured (run locally)"
fi
echo ""

# 8. Security Check
echo "8. Security Audit..."
if npm audit --audit-level=moderate > /dev/null 2>&1; then
  check_passed "Security audit passed"
else
  check_warning "Security vulnerabilities found (check with npm audit)"
fi
echo ""

# 9. Environment Variables
echo "9. Checking Environment Configuration..."
if grep -q "SENTRY_DSN" .env.production 2>/dev/null || [ -n "$SENTRY_DSN" ]; then
  check_passed "Sentry DSN configured"
else
  check_warning "Sentry DSN not configured"
fi

if grep -q "GA_MEASUREMENT_ID" .env.production 2>/dev/null || [ -n "$GA_MEASUREMENT_ID" ]; then
  check_passed "Google Analytics configured"
else
  check_warning "Google Analytics not configured"
fi
echo ""

# 10. Security Headers
echo "10. Checking Security Headers..."
if grep -q "Content-Security-Policy" src/index.html; then
  check_passed "CSP Header configured"
else
  check_failed "CSP Header NOT configured"
fi

if grep -q "X-Frame-Options" src/index.html; then
  check_passed "X-Frame-Options configured"
else
  check_failed "X-Frame-Options NOT configured"
fi
echo ""

# 11. Files Check
echo "11. Critical Files Check..."
CRITICAL_FILES=(
  "src/main.ts"
  "src/index.html"
  "src/app/app.routes.ts"
  "src/app/app.component.ts"
)

for file in "${CRITICAL_FILES[@]}"; do
  if [ -f "$file" ]; then
    check_passed "$file exists"
  else
    check_failed "$file MISSING"
  fi
done
echo ""

# 12. Service Worker
echo "12. Service Worker Check..."
if [ -f "src/manifest.webmanifest" ]; then
  check_passed "PWA manifest configured"
else
  check_warning "PWA manifest not found (optional)"
fi
echo ""

# Summary
echo ""
echo "=== Summary ==="
echo "Pre-deployment checks completed!"
echo ""
echo "Next steps:"
echo "1. Review any warnings above"
echo "2. Test locally: npm start"
echo "3. Build production: npm run build:prod"
echo "4. Deploy dist/metaiq-frontend/ to your server"
echo ""
echo "Remember to:"
echo "- Set environment variables in production"
echo "- Configure Sentry DSN"
echo "- Configure Google Analytics ID"
echo "- Enable HTTPS (required for CSP)"
echo "- Set up proper CORS headers on backend"
echo ""
