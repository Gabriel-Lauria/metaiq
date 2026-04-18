#!/usr/bin/env node

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function fixPassword() {
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

    // Generate fresh hash
    const password = 'Demo@1234';
    const hashedPassword = bcrypt.hashSync(password, 12);
    console.log('🔑 Hash novo gerado:', hashedPassword);

    // Test the hash locally
    const testCompare = bcrypt.compareSync(password, hashedPassword);
    console.log('✓ Teste local de comparação:', testCompare ? 'OK' : 'FALHOU');

    if (!testCompare) {
      console.error('❌ Hash gerado não corresponde à senha! Abortando...');
      process.exit(1);
    }

    // Update password in database
    const updateResult = await client.query(
      'UPDATE public."users" SET password = $1 WHERE email = $2 RETURNING id, email, password',
      [hashedPassword, 'demo@metaiq.dev']
    );

    if (updateResult.rows.length === 0) {
      console.log('⚠️  Usuário demo não existe.');
      process.exit(1);
    }

    const userId = updateResult.rows[0].id;
    const savedHash = updateResult.rows[0].password;

    console.log(`✅ Senha atualizada para: ${updateResult.rows[0].email}`);
    console.log(`   ID: ${userId}`);
    console.log(`   Hash no banco: ${savedHash}`);

    // Verify hash from database matches
    const hashMatch = hashedPassword === savedHash;
    console.log(`   Hash match: ${hashMatch ? 'SIM ✓' : 'NÃO ✗'}`);

    const dbCompare = bcrypt.compareSync(password, savedHash);
    console.log(`   Comparação DB: ${dbCompare ? 'OK ✓' : 'FALHOU ✗'}`);

    console.log('\n🎯 Credenciais:');
    console.log('   Email: demo@metaiq.dev');
    console.log('   Senha: Demo@1234');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixPassword();
