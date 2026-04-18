const AppDataSource = require('./dist/data-source.js').default;
const bcrypt = require('bcryptjs');

async function updatePassword() {
  try {
    await AppDataSource.initialize();
    
    const hashed = '$2b$12$UHeu5pIjPMmAIcJCAN44HO4JhUAUFVZz4Im0.HLvgdNWJswIlHwYu';
    
    const result = await AppDataSource.query(
      'UPDATE public."user" SET password = $1 WHERE email = $2',
      [hashed, 'demo@metaiq.dev']
    );
    
    console.log('✅ Senha do usuário demo atualizada!');
    console.log('   Email: demo@metaiq.dev');
    console.log('   Senha: Demo@1234');
    
    await AppDataSource.destroy();
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

updatePassword();
