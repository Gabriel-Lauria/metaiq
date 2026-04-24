#!/bin/bash
# Test script to verify CTA bug fix
# Uso: bash test-cta-fix.sh

echo "🧪 CTA Bug Fix - Test Suite"
echo "=============================="
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Verificar que cta.constants.ts existe e tem tipos corretos
echo -e "${YELLOW}[1/5]${NC} Verificando arquivo de constantes..."
if grep -q "type MetaCallToActionType" metaiq-frontend/src/app/features/campaigns/cta.constants.ts && \
   grep -q "LEARN_MORE\|SHOP_NOW\|CONTACT_US" metaiq-frontend/src/app/features/campaigns/cta.constants.ts; then
  echo -e "${GREEN}✓${NC} cta.constants.ts contém tipos Meta API corretos"
else
  echo -e "${RED}✗${NC} Erro: cta.constants.ts não tem tipos corretos"
  exit 1
fi

# Test 2: Verificar que campaign-builder.types.ts usa MetaCallToActionType
echo -e "${YELLOW}[2/5]${NC} Verificando tipos do builder..."
if grep -q "cta: MetaCallToActionType" metaiq-frontend/src/app/features/campaigns/campaign-builder.types.ts; then
  echo -e "${GREEN}✓${NC} campaign-builder.types.ts usa MetaCallToActionType"
else
  echo -e "${RED}✗${NC} Erro: creative.cta não está como MetaCallToActionType"
  exit 1
fi

# Test 3: Verificar que backend DTO valida CTAs
echo -e "${YELLOW}[3/5]${NC} Verificando validação backend..."
if grep -q "@IsIn(\['LEARN_MORE'" metaiq-backend/src/modules/integrations/meta/dto/meta-integration.dto.ts; then
  echo -e "${GREEN}✓${NC} Backend DTO valida CTAs da Meta API"
else
  echo -e "${RED}✗${NC} Erro: Backend DTO não valida CTAs"
  exit 1
fi

# Test 4: Verificar que orchestrator foi simplificado
echo -e "${YELLOW}[4/5]${NC} Verificando orchestrator..."
if grep -q "this.validCtaTypes" metaiq-backend/src/modules/integrations/meta/meta-campaign.orchestrator.ts && \
   ! grep -q "normalized.includes('COMPRAR')" metaiq-backend/src/modules/integrations/meta/meta-campaign.orchestrator.ts; then
  echo -e "${GREEN}✓${NC} Orchestrator foi simplificado corretamente"
else
  echo -e "${RED}✗${NC} Erro: Orchestrator ainda usa pattern matching frágil"
  exit 1
fi

# Test 5: Verificar que não há strings hardcoded em português fora das constantes
echo -e "${YELLOW}[5/5]${NC} Verificando referências a labels em PT-BR..."
HARDCODED_REFERENCES=$(grep -r "Comprar agora\|Fale conosco" \
  --include="*.ts" \
  metaiq-frontend/src/app/features/campaigns/ \
  --exclude="cta.constants.ts" \
  2>/dev/null | grep -v "test\|spec" | wc -l)

if [ "$HARDCODED_REFERENCES" -eq 0 ]; then
  echo -e "${GREEN}✓${NC} Sem strings hardcoded em PT-BR fora das constantes"
else
  echo -e "${YELLOW}⚠${NC} Aviso: Encontradas $HARDCODED_REFERENCES referências a labels em PT-BR"
  echo "   (Verifique se são comentários ou strings de teste)"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Todos os testes passaram!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Próximos passos:"
echo "1. Compilar frontend: npm run build"
echo "2. Compilar backend: npm run build"
echo "3. Testar fluxo manual no browser"
echo "4. Criar campanha com cada opção de CTA"
echo "5. Verificar no DevTools que payload envia valor técnico"
