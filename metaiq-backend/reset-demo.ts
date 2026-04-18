import AppDataSource from './src/data-source';
import { User } from './src/modules/users/user.entity';

async function resetDemoUser() {
  const ds = AppDataSource;
  await ds.initialize();
  
  const userRepo = ds.getRepository(User);
  
  // Delete demo user if exists
  await userRepo.delete({ email: 'demo@metaiq.dev' });
  
  console.log('✅ Usuário demo foi deletado. Execute npm run seed para recriar.');
  
  await ds.destroy();
}

resetDemoUser().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
