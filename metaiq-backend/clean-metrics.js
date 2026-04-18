#!/usr/bin/env node

const { Client } = require('pg');

async function cleanMetrics() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'metaiq',
    user: 'metaiq_user',
    password: 'Meta123@',
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // Delete all data in this order (respecting foreign keys)
    console.log('🗑️  Deletando dados...');
    
    await client.query('DELETE FROM public."insights"');
    console.log('   ✓ Insights deletados');
    
    await client.query('DELETE FROM public."meta_campaign_creations"');
    console.log('   ✓ Meta campaign creations deletados');
    
    await client.query('DELETE FROM public."metrics_daily"');
    console.log('   ✓ Métricas deletadas');
    
    await client.query('DELETE FROM public."campaigns"');
    console.log('   ✓ Campanhas deletadas');

    console.log('\n✅ Limpeza concluída!');

  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

cleanMetrics();
