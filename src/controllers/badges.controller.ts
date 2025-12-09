import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../middlewares/errorHandler';
import { createSuccessResponse } from '../utils/response';
import { query, queryOne, execute } from '../utils/database';
import { generateUUID } from '../utils/uuid';

export class BadgesController {
  /**
   * GET /admin/badges
   * Listar selos AMANGOLA
   */
  static async listBadges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        status = 'all', // 'all' | 'active' | 'revoked'
        search = '',
        page = 1,
        limit = 10,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 10);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      const whereConditions: string[] = ["c.certificate_type = 'zolangola_badge'"];
      const params: any[] = [];

      if (status === 'active') {
        whereConditions.push('c.is_revoked = FALSE');
      } else if (status === 'revoked') {
        whereConditions.push('c.is_revoked = TRUE');
      }

      if (search) {
        whereConditions.push(
          `(tu.first_name LIKE ? OR tu.last_name LIKE ? OR c.certificate_number LIKE ?)`
        );
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total 
         FROM certificates c
         JOIN talent_profiles tp ON c.talent_profile_id = tp.id
         JOIN talent_users tu ON tp.talent_user_id = tu.id
         ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      // Buscar selos
      const badges = await query<any>(
        `SELECT 
          c.id,
          c.certificate_number,
          c.talent_profile_id,
          c.title,
          c.description,
          c.issued_at,
          c.expires_at,
          c.is_revoked,
          c.revoked_at,
          c.revocation_reason,
          c.revoked_by,
          c.verification_url,
          c.qr_code_url,
          c.pdf_url,
          tu.first_name,
          tu.last_name,
          tu.profile_picture_url,
          u.email
        FROM certificates c
        JOIN talent_profiles tp ON c.talent_profile_id = tp.id
        JOIN talent_users tu ON tp.talent_user_id = tu.id
        JOIN users u ON tu.user_id = u.id
        ${whereClause}
        ORDER BY c.issued_at DESC
        LIMIT ${Math.floor(limitNum)} OFFSET ${Math.floor(offset)}`,
        params
      );

      // Normalizar dados
      const normalizedBadges = badges.map((badge: any) => ({
        id: badge.id,
        certificateNumber: badge.certificate_number,
        talentProfileId: badge.talent_profile_id,
        talentName: `${badge.first_name} ${badge.last_name}`,
        talentEmail: badge.email,
        profilePictureUrl: badge.profile_picture_url,
        title: badge.title,
        description: badge.description,
        issuedAt: badge.issued_at,
        expiresAt: badge.expires_at,
        isActive: !badge.is_revoked,
        isRevoked: badge.is_revoked,
        revokedAt: badge.revoked_at,
        revocationReason: badge.revocation_reason,
        revokedBy: badge.revoked_by,
        verificationUrl: badge.verification_url,
        qrCodeUrl: badge.qr_code_url,
        pdfUrl: badge.pdf_url,
      }));

      res.status(200).json(
        createSuccessResponse({
          badges: normalizedBadges,
          pagination: {
            total,
            page: Number(page),
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
          },
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/badges
   * Emitir selo AMANGOLA
   */
  static async issueBadge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { talentProfileId, reason } = req.body;

      if (!talentProfileId) {
        throw new CustomError('ID do perfil de talento é obrigatório', 400);
      }

      // Se o ID começa com 'temp-', significa que não há perfil ainda, criar um
      let talentProfile: any;
      if (talentProfileId.startsWith('temp-')) {
        const talentUserId = talentProfileId.replace('temp-', '');
        // Buscar talent_user pelo ID
        const talentUser = await queryOne<any>(
          `SELECT id, user_id FROM talent_users WHERE id = ?`,
          [talentUserId]
        );

        if (!talentUser) {
          throw new CustomError('Talento não encontrado', 404);
        }

        // Verificar se já existe perfil
        talentProfile = await queryOne<any>(
          `SELECT id, talent_user_id FROM talent_profiles WHERE talent_user_id = ?`,
          [talentUserId]
        );

        // Se não existe, criar um perfil básico
        if (!talentProfile) {
          const profileId = generateUUID();
          await execute(
            `INSERT INTO talent_profiles (id, talent_user_id, has_zolangola_badge, is_verified, profile_visibility)
             VALUES (?, ?, FALSE, FALSE, 'public')`,
            [profileId, talentUserId]
          );
          talentProfile = { id: profileId, talent_user_id: talentUserId };
        }
      } else {
        // Verificar se o talento existe
        talentProfile = await queryOne<any>(
          `SELECT id, talent_user_id FROM talent_profiles WHERE id = ?`,
          [talentProfileId]
        );

        if (!talentProfile) {
          throw new CustomError('Perfil de talento não encontrado', 404);
        }
      }

      // Usar o ID correto do perfil
      const profileIdToUpdate = talentProfile.id;

      // Verificar se já tem selo ativo
      const existingBadge = await queryOne<any>(
        `SELECT id FROM certificates 
         WHERE talent_profile_id = ? 
         AND certificate_type = 'zolangola_badge' 
         AND is_revoked = FALSE`,
        [profileIdToUpdate]
      );

      if (existingBadge) {
        throw new CustomError('Este talento já possui um selo ativo', 400);
      }

      const badgeId = generateUUID();
      const certificateNumber = `ZOL-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const now = new Date();

      // Criar certificado/selo - usar o ID correto do perfil
      await execute(
        `INSERT INTO certificates (
          id, certificate_number, talent_profile_id, certificate_type,
          title, description, issued_at, verification_url
        ) VALUES (?, ?, ?, 'zolangola_badge', ?, ?, ?, ?)`,
        [
          badgeId,
          certificateNumber,
          profileIdToUpdate,
          'Selo AMANGOLA',
          reason || 'Selo de qualidade AMANGOLA emitido pelo administrador',
          now,
          `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify/${certificateNumber}`,
        ]
      );

      // Atualizar talent_profiles - usar o ID correto do perfil
      await execute(
        `UPDATE talent_profiles 
         SET has_zolangola_badge = TRUE, badge_issued_at = ? 
         WHERE id = ?`,
        [now, profileIdToUpdate]
      );

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'issue_badge', 'certificate', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          badgeId,
          JSON.stringify({ talentProfileId, certificateNumber, reason }),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(201).json(
        createSuccessResponse({
          id: badgeId,
          certificateNumber,
          message: 'Selo emitido com sucesso',
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/badges/:id/revoke
   * Revogar selo AMANGOLA
   */
  static async revokeBadge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        throw new CustomError('Motivo da revogação é obrigatório', 400);
      }

      // Verificar se o selo existe
      const badge = await queryOne<any>(
        `SELECT id, talent_profile_id, is_revoked FROM certificates 
         WHERE id = ? AND certificate_type = 'zolangola_badge'`,
        [id]
      );

      if (!badge) {
        throw new CustomError('Selo não encontrado', 404);
      }

      if (badge.is_revoked) {
        throw new CustomError('Selo já foi revogado', 400);
      }

      const now = new Date();

      // Revogar selo
      await execute(
        `UPDATE certificates 
         SET is_revoked = TRUE, revoked_at = ?, revocation_reason = ?, revoked_by = ?
         WHERE id = ?`,
        [now, reason, userId, id]
      );

      // Atualizar talent_profiles
      await execute(
        `UPDATE talent_profiles 
         SET has_zolangola_badge = FALSE, badge_revoked_at = ?, badge_revocation_reason = ?
         WHERE id = ?`,
        [now, reason, badge.talent_profile_id]
      );

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'revoke_badge', 'certificate', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          id,
          JSON.stringify({ reason, revokedAt: now }),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(200).json(createSuccessResponse({ message: 'Selo revogado com sucesso' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/badges/:id/history
   * Histórico do selo
   */
  static async getBadgeHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      // Buscar selo
      const badge = await queryOne<any>(
        `SELECT * FROM certificates WHERE id = ? AND certificate_type = 'zolangola_badge'`,
        [id]
      );

      if (!badge) {
        throw new CustomError('Selo não encontrado', 404);
      }

      // Buscar histórico de auditoria
      const history = await query<any>(
        `SELECT * FROM audit_logs 
         WHERE entity_type = 'certificate' AND entity_id = ?
         ORDER BY created_at DESC`,
        [id]
      );

      res.status(200).json(
        createSuccessResponse({
          badge: {
            id: badge.id,
            certificateNumber: badge.certificate_number,
            issuedAt: badge.issued_at,
            revokedAt: badge.revoked_at,
            revocationReason: badge.revocation_reason,
            isRevoked: badge.is_revoked,
          },
          history: history.map((log: any) => ({
            action: log.action,
            changes: log.changes,
            createdAt: log.created_at,
          })),
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

