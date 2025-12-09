import { queryOne, execute } from './database';
import { generateUUID } from './uuid';
import { CustomError } from '../middlewares/errorHandler';

/**
 * Obter ou criar company_profile_id para um usuário
 * 
 * Esta função garante que:
 * 1. O usuário existe e é do tipo 'company'
 * 2. O company_user existe (cria se não existir com NIF temporário)
 * 3. O company_profile existe (cria se não existir com valores padrão)
 * 
 * Estrutura esperada das tabelas:
 * - company_users: id, user_id, company_name, nif (UNIQUE NOT NULL), approval_status
 * - company_profiles: id, company_user_id, description, website, phone, address, 
 *   city, province, country, industry, company_size (ENUM: '1-10', '11-50', '51-200', '201-500', '500+'), logo_url
 */
export async function getOrCreateCompanyProfileId(userId: string): Promise<string> {
  // Verificar se o usuário é do tipo company
  const user = await queryOne<any>(
    `SELECT id, user_type FROM users WHERE id = ?`,
    [userId]
  );

  if (!user) {
    throw new CustomError('Usuário não encontrado', 404);
  }

  if (user.user_type !== 'company') {
    throw new CustomError('Usuário não é do tipo empresa', 403);
  }

  // Buscar ou criar company_user
  let companyUser = await queryOne<any>(
    `SELECT id FROM company_users WHERE user_id = ?`,
    [userId]
  );

  if (!companyUser) {
    // Criar company_user automaticamente
    const companyUserId = generateUUID();
    // Gerar NIF temporário único baseado no user_id
    const tempNif = `TEMP-${userId.substring(0, 8).toUpperCase()}`;
    await execute(
      `INSERT INTO company_users (
        id, user_id, company_name, nif, approval_status
      ) VALUES (?, ?, ?, ?, 'pending')`,
      [companyUserId, userId, `Empresa ${userId.substring(0, 8)}`, tempNif]
    );
    companyUser = { id: companyUserId };
  }

  // Verificar se já existe company_profile
  let companyProfile = await queryOne<any>(
    `SELECT id FROM company_profiles WHERE company_user_id = ?`,
    [companyUser.id]
  );

  // Se não existir, criar automaticamente
  if (!companyProfile) {
    const profileId = generateUUID();
    await execute(
      `INSERT INTO company_profiles (
        id, company_user_id, company_size, industry, website,
        description, logo_url, country
      ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 'Angola')`,
      [profileId, companyUser.id]
    );
    companyProfile = { id: profileId };
  }

  return companyProfile.id;
}

