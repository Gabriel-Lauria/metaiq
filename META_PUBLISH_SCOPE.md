# META_PUBLISH_SCOPE

## Escopo oficial do Meta Publisher

O publisher Meta atual da MetaIQ suporta publicacao automatica apenas para campanhas de website.

## Suportado

- Website campaigns
- destinationUrl em HTTPS
- creative baseado em `link_data`
- fluxo com `pageId` + site
- publicacao inicial em status `PAUSED`

## Nao suportado ainda

- WhatsApp
- Messenger
- Instagram DM
- message campaigns end-to-end
- `whatsappBusinessPhoneNumberId`
- `instagramActorId`
- destination de mensagem real na publicacao automatica

## Regra de produto

Se a IA identificar uma campanha de mensagens, ela pode:

- sugerir estrategia
- sugerir estrutura
- sugerir copy
- sugerir CTA compativel

Mas nao pode marcar a campanha como pronta para publicacao automatica na Meta.

## Comportamento esperado

- `destinationType = messages` deve resultar em revisao obrigatoria
- o frontend deve bloquear publish automatico
- a UX deve explicar claramente que o escopo atual de publish automatico e apenas website
- nenhum texto do produto deve prometer publicacao automatica de WhatsApp, Messenger ou Instagram DM enquanto esse suporte nao existir end-to-end
