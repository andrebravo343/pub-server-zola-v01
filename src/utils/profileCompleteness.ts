import { queryOne } from './database';

/**
 * Verificar se um perfil de talento está completo
 * Um perfil é considerado completo quando tem:
 * - Nome completo (first_name e last_name)
 * - Telefone
 * - Título profissional (title)
 * - Biografia (bio)
 * - Localização (city ou country)
 * - Pelo menos uma competência (skill)
 */
export async function isTalentProfileComplete(talentProfileId: string): Promise<boolean> {
  try {
    const profile = await queryOne<any>(
      `SELECT 
        tu.first_name,
        tu.last_name,
        tu.phone,
        tp.title,
        tp.bio,
        tp.city,
        tp.country,
        (SELECT COUNT(*) FROM talent_skills ts WHERE ts.talent_profile_id = tp.id) as skills_count
      FROM talent_profiles tp
      INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
      WHERE tp.id = ?`,
      [talentProfileId]
    );

    if (!profile) {
      return false;
    }

    // Verificar campos obrigatórios
    const hasName = !!(profile.first_name && profile.last_name);
    const hasPhone = !!profile.phone;
    const hasTitle = !!profile.title;
    const hasBio = !!profile.bio;
    const hasLocation = !!(profile.city || profile.country);
    const hasSkills = (profile.skills_count || 0) > 0;

    // Perfil completo se tiver todos os campos
    return hasName && hasPhone && hasTitle && hasBio && hasLocation && hasSkills;
  } catch (error) {
    console.error('Erro ao verificar completude do perfil:', error);
    return false;
  }
}

