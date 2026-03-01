import { queryOne, execute } from "../utils/database";
import { generateUUID } from "./uuid";

/**
 * Obter ou criar talent_user_id e talent_profile_id
 * Similar ao companyHelper, mas para talentos
 */
export async function getOrCreateTalentProfileId(
  userId: string,
): Promise<{ talentUserId: string; talentProfileId: string }> {
  // Verificar se existe talent_user
  let talentUser = await queryOne<any>(
    `SELECT id FROM talent_users WHERE user_id = ?`,
    [userId],
  );

  // Se não existe, criar
  if (!talentUser) {
    const talentUserId = generateUUID();

    // Tentar obter nome do perfil OAuth se disponível
    let firstName = "Nome";
    let lastName = "Apelido";

    try {
      const oauthProfile = await queryOne<any>(
        `SELECT profile_data FROM oauth_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );

      if (oauthProfile?.profile_data) {
        const profileData =
          typeof oauthProfile.profile_data === "string"
            ? JSON.parse(oauthProfile.profile_data)
            : oauthProfile.profile_data;

        if (profileData.name) {
          const nameParts = profileData.name.trim().split(" ");
          if (nameParts.length >= 2) {
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(" ");
          } else if (nameParts.length === 1) {
            firstName = nameParts[0];
            lastName = "";
          }
        }
      }
    } catch (error) {
      // Se falhar ao obter dados OAuth, usar valores padrão
      console.log(
        "Não foi possível obter dados do OAuth, usando valores padrão",
      );
    }

    try {
      await execute(
        `INSERT INTO talent_users (id, user_id, first_name, last_name, onboarding_completed)
       VALUES (?, ?, ?, ?, FALSE)`,
        [talentUserId, userId, firstName, lastName],
      );
      talentUser = { id: talentUserId };
    } catch (error: any) {
      // Se for erro de duplicação (race condition), buscar o registro existente
      if (error.code === "ER_DUP_ENTRY") {
        console.log(
          "Talent user já existe (race condition), buscando registro...",
        );
        talentUser = await queryOne<any>(
          `SELECT id FROM talent_users WHERE user_id = ?`,
          [userId],
        );
        if (!talentUser) {
          throw error; // Se ainda não encontrar, lançar erro original
        }
      } else {
        throw error;
      }
    }
  }

  // Verificar se existe talent_profile
  let talentProfile = await queryOne<any>(
    `SELECT id FROM talent_profiles WHERE talent_user_id = ?`,
    [talentUser.id],
  );

  // Se não existe, criar um básico
  if (!talentProfile) {
    const talentProfileId = generateUUID();
    await execute(
      `INSERT INTO talent_profiles (
        id, talent_user_id, profile_visibility, availability_status, is_remote
      ) VALUES (?, ?, 'public', 'available', FALSE)`,
      [talentProfileId, talentUser.id],
    );
    talentProfile = { id: talentProfileId };
  }

  return {
    talentUserId: talentUser.id,
    talentProfileId: talentProfile.id,
  };
}
