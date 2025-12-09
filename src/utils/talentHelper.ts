import { queryOne, execute } from '../utils/database';
import { generateUUID } from './uuid';

/**
 * Obter ou criar talent_user_id e talent_profile_id
 * Similar ao companyHelper, mas para talentos
 */
export async function getOrCreateTalentProfileId(userId: string): Promise<{ talentUserId: string; talentProfileId: string }> {
  // Verificar se existe talent_user
  let talentUser = await queryOne<any>(
    `SELECT id FROM talent_users WHERE user_id = ?`,
    [userId]
  );

  // Se não existe, criar
  if (!talentUser) {
    const talentUserId = generateUUID();
    await execute(
      `INSERT INTO talent_users (id, user_id, onboarding_completed)
       VALUES (?, ?, FALSE)`,
      [talentUserId, userId]
    );
    talentUser = { id: talentUserId };
  }

  // Verificar se existe talent_profile
  let talentProfile = await queryOne<any>(
    `SELECT id FROM talent_profiles WHERE talent_user_id = ?`,
    [talentUser.id]
  );

  // Se não existe, criar um básico
  if (!talentProfile) {
    const talentProfileId = generateUUID();
    await execute(
      `INSERT INTO talent_profiles (
        id, talent_user_id, profile_visibility, availability_status, is_remote
      ) VALUES (?, ?, 'public', 'available', FALSE)`,
      [talentProfileId, talentUser.id]
    );
    talentProfile = { id: talentProfileId };
  }

  return {
    talentUserId: talentUser.id,
    talentProfileId: talentProfile.id,
  };
}

