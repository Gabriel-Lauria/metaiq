#!/usr/bin/env node

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function restoreUser() {
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

    // Restore user and update password
    const updateResult = await client.query(
      `UPDATE public."users" 
       SET password = $1, "active" = true, "deletedAt" = NULL 
       WHERE email = $2 
       RETURNING id, email, active, "deletedAt"`,
      [hashedPassword, 'demo@metaiq.dev']
    );

    if (updateResult.rows.length === 0) {
      console.log('⚠️  Usuário demo não encontrado.');
      process.exit(1);
    }

    const user = updateResult.rows[0];
    console.log('✅ Usuário demo restaurado!');
    console.log(`   Email: ${user.email}`);
    console.log(`   Active: ${user.active}`);
    console.log(`   DeletedAt: ${user.deletedAt}`);
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

restoreUser();
