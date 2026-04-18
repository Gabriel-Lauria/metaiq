#!/usr/bin/env node

const { Client } = require('pg');

async function checkUser() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'metaiq',
    user: 'metaiq_user',
    password: 'Meta123@',
  });

  try {
    await client.connect();

    const result = await client.query(
      'SELECT id, email, active, "deletedAt", password, role FROM public."users" WHERE email = $1',
      ['demo@metaiq.dev']
    );

    if (result.rows.length === 0) {
      console.log('❌ Usuário não encontrado!');
      process.exit(1);
    }

    const user = result.rows[0];
    console.log('\n📊 Informações do usuário demo:');
    console.log(`   Email: ${user.email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Active: ${user.active}`);
    console.log(`   DeletedAt: ${user.deletedAt}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Password hash: ${user.password.substring(0, 20)}...${user.password.substring(user.password.length - 10)}`);
    console.log(`   Password length: ${user.password.length}`);

  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkUser();
