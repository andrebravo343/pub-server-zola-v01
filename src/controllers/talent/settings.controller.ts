import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { queryOne, execute } from '../../utils/database';
import { getOrCreateTalentProfileId } from '../../utils/talentHelper';

export class TalentSettingsController {
  /**
   * GET /talent/settings
   * Obter configurações do talento
   */
  static async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      // Buscar configurações do perfil
      const profile = await queryOne<any>(
        `SELECT 
          profile_visibility,
          notification_email,
          notification_sms,
          notification_push
        FROM talent_profiles
        WHERE id = ?`,
        [talentProfileId]
      );

      if (!profile) {
        throw new CustomError('Perfil não encontrado', 404);
      }

      const settings = {
        notifications: {
          email: Boolean(profile.notification_email),
          sms: Boolean(profile.notification_sms),
          push: Boolean(profile.notification_push),
        },
        privacy: {
          profileVisibility: profile.profile_visibility || 'public',
        },
      };

      res.status(200).json(createSuccessResponse(settings));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /talent/settings
   * Atualizar configurações do talento
   */
  static async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      const { notifications, privacy } = req.body;

      const updateFields: string[] = [];
      const values: any[] = [];

      if (notifications) {
        if (notifications.email !== undefined) {
          updateFields.push('notification_email = ?');
          values.push(Boolean(notifications.email));
        }
        if (notifications.sms !== undefined) {
          updateFields.push('notification_sms = ?');
          values.push(Boolean(notifications.sms));
        }
        if (notifications.push !== undefined) {
          updateFields.push('notification_push = ?');
          values.push(Boolean(notifications.push));
        }
      }

      if (privacy?.profileVisibility) {
        const validVisibilities = ['public', 'private', 'companies_only'];
        if (validVisibilities.includes(privacy.profileVisibility)) {
          updateFields.push('profile_visibility = ?');
          values.push(privacy.profileVisibility);
        }
      }

      if (updateFields.length === 0) {
        throw new CustomError('Nenhum campo para atualizar', 400);
      }

      values.push(talentProfileId);

      await execute(
        `UPDATE talent_profiles SET ${updateFields.join(', ')} WHERE id = ?`,
        values
      );

      res.status(200).json(createSuccessResponse({ message: 'Configurações atualizadas com sucesso' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /talent/settings/password
   * Alterar senha do talento
   */
  static async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        throw new CustomError('Senha atual e nova senha são obrigatórias', 400);
      }

      if (newPassword.length < 6) {
        throw new CustomError('A nova senha deve ter pelo menos 6 caracteres', 400);
      }

      // Buscar usuário e verificar senha atual
      const user = await queryOne<any>(
        `SELECT id, password_hash FROM users WHERE id = ?`,
        [userId]
      );

      if (!user) {
        throw new CustomError('Usuário não encontrado', 404);
      }

      // Verificar senha atual (usar bcrypt.compare)
      const bcrypt = require('bcrypt');
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

      if (!isPasswordValid) {
        throw new CustomError('Senha atual incorreta', 401);
      }

      // Hash da nova senha
      const saltRounds = 10;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Atualizar senha
      await execute(
        `UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?`,
        [newPasswordHash, userId]
      );

      res.status(200).json(createSuccessResponse({ message: 'Senha alterada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }
}

