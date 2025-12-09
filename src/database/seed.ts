import dotenv from 'dotenv';
import { execute, queryOne } from '../utils/database';
import { testConnection } from '../config/database';
import { UserModel } from '../models/User.model';
import { generateUUID } from '../utils/uuid';

// Carregar variáveis de ambiente
dotenv.config();

async function seedDatabase() {
  try {
    console.log('🌱 Iniciando seed do banco de dados...\n');

    // Testar conexão
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Não foi possível conectar ao banco de dados');
    }

    // 1. Criar usuário administrador padrão
    console.log('👤 Criando usuário administrador...');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@zolangola.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'change-me-in-production';

    // Verificar se admin já existe
    const existingAdmin = await UserModel.findByEmail(adminEmail);
    
    if (existingAdmin) {
      console.log(`⚠️  Usuário admin já existe: ${adminEmail}`);
    } else {
      // Criar usuário admin
      const adminUser = await UserModel.create({
        email: adminEmail,
        password: adminPassword,
        userType: 'admin',
      });

      // Criar registro em admin_users
      const adminUserId = generateUUID();
      await execute(
        `INSERT INTO admin_users (id, user_id, full_name, role, permissions)
         VALUES (?, ?, ?, ?, ?)`,
        [
          adminUserId,
          adminUser.id,
          'Administrador Principal',
          'super_admin',
          JSON.stringify(['*']), // Todas as permissões
        ]
      );

      console.log(`✅ Usuário admin criado: ${adminEmail}`);
      console.log(`   ⚠️  IMPORTANTE: Altere a senha padrão em produção!\n`);
    }

    // 2. Criar planos de subscrição padrão
    console.log('📦 Criando planos de subscrição...');
    
    const plans = [
      {
        id: generateUUID(),
        name: 'Básico',
        description: 'Plano básico para pequenas empresas',
        plan_type: 'basic',
        price: 50000.00, // 50.000 AOA
        price_currency: 'AOA',
        billing_period: 'monthly',
        features: JSON.stringify([
          'Até 5 vagas ativas',
          'Pesquisa básica de talentos',
          'Suporte por email',
        ]),
      },
      {
        id: generateUUID(),
        name: 'Premium',
        description: 'Plano premium para empresas em crescimento',
        plan_type: 'premium',
        price: 150000.00, // 150.000 AOA
        price_currency: 'AOA',
        billing_period: 'monthly',
        features: JSON.stringify([
          'Vagas ilimitadas',
          'Pesquisa avançada de talentos',
          'Triagem pela ZOLANGOLA',
          'Destaque de vagas',
          'Suporte prioritário',
          'Relatórios avançados',
        ]),
      },
      {
        id: generateUUID(),
        name: 'Enterprise',
        description: 'Plano enterprise para grandes empresas',
        plan_type: 'enterprise',
        price: 500000.00, // 500.000 AOA
        price_currency: 'AOA',
        billing_period: 'monthly',
        features: JSON.stringify([
          'Vagas ilimitadas',
          'Pesquisa avançada de talentos',
          'Triagem completa pela ZOLANGOLA',
          'Destaque máximo de vagas',
          'Suporte dedicado',
          'Relatórios personalizados',
          'API personalizada',
          'Gestor de conta dedicado',
        ]),
      },
    ];

    for (const plan of plans) {
      // Verificar se plano já existe
      const existingPlan = await queryOne<any>(
        `SELECT id FROM subscription_plans WHERE plan_type = ?`,
        [plan.plan_type]
      );

      if (existingPlan) {
        console.log(`⚠️  Plano ${plan.plan_type} já existe`);
      } else {
        await execute(
          `INSERT INTO subscription_plans 
           (id, name, description, plan_type, price, price_currency, billing_period, features, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            plan.id,
            plan.name,
            plan.description,
            plan.plan_type,
            plan.price,
            plan.price_currency,
            plan.billing_period,
            plan.features,
            true,
          ]
        );
        console.log(`✅ Plano ${plan.name} criado`);
      }
    }

    console.log('');

    // 3. Criar cursos exemplo (opcional)
    console.log('📚 Criando cursos exemplo...');
    
    const courses = [
      {
        id: generateUUID(),
        title: 'Introdução ao Desenvolvimento Web',
        description: 'Curso introdutório sobre desenvolvimento web moderno',
        category: 'Tecnologia',
        level: 'beginner',
        course_type: 'free',
        duration_hours: 20,
        is_active: true,
      },
      {
        id: generateUUID(),
        title: 'Gestão de Recursos Humanos',
        description: 'Fundamentos de RH e gestão de pessoas',
        category: 'Gestão',
        level: 'intermediate',
        course_type: 'paid',
        duration_hours: 40,
        price: 25000.00,
        price_currency: 'AOA',
        is_active: true,
      },
    ];

    for (const course of courses) {
      // Verificar se curso já existe
      const existingCourse = await queryOne<any>(
        `SELECT id FROM courses WHERE title = ?`,
        [course.title]
      );

      if (existingCourse) {
        console.log(`⚠️  Curso "${course.title}" já existe`);
      } else {
        await execute(
          `INSERT INTO courses 
           (id, title, description, category, level, course_type, duration_hours, price, price_currency, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            course.id,
            course.title,
            course.description,
            course.category,
            course.level,
            course.course_type,
            course.duration_hours,
            course.price || null,
            course.price_currency || 'AOA',
            course.is_active,
          ]
        );
        console.log(`✅ Curso "${course.title}" criado`);
      }
    }

    console.log('\n✅ Seed do banco de dados concluído com sucesso!');
    console.log('\n📋 Resumo:');
    console.log('   - Usuário admin criado/verificado');
    console.log('   - Planos de subscrição criados');
    console.log('   - Cursos exemplo criados');
    console.log('\n⚠️  Lembrete: Altere as senhas padrão em produção!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro ao executar seed:', error);
    process.exit(1);
  }
}

seedDatabase();

