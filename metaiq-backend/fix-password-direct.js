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

    // Generate correct hash
    const hashedPassword = bcrypt.hashSync('Demo@1234', 12);
    console.log('🔑 Hash gerado:', hashedPassword);

    // First, check if user exists
    const checkResult = await client.query(
      'SELECT id, email FROM public."users" WHERE email = $1',
      ['demo@metaiq.dev']
    );

    if (checkResult.rows.length === 0) {
      console.log('⚠️  Usuário demo não existe. Pulando...');
    } else {
      const userId = checkResult.rows[0].id;
      console.log(`✅ Encontrado user ID: ${userId}`);

      // Update password
      const updateResult = await client.query(
        'UPDATE public."users" SET password = $1 WHERE id = $2 RETURNING id, email',
        [hashedPassword, userId]
      );

      console.log(`✅ Senha atualizada para: ${updateResult.rows[0].email}`);
      console.log('🎯 Credenciais:');
      console.log('   Email: demo@metaiq.dev');
      console.log('   Senha: Demo@1234');
    }
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixPassword();
