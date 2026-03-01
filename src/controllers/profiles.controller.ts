import { Request, Response, NextFunction } from "express";
import { CustomError } from "../middlewares/errorHandler";
import { createSuccessResponse } from "../utils/response";
import { query, queryOne, execute } from "../utils/database";

export class ProfilesController {
  /**
   * GET /admin/profiles
   * Listar perfis (talentos e empresas) com filtros
   */
  static async listProfiles(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError("Usuário não autenticado", 401);
      }

      const {
        type = "all", // 'talents' | 'companies' | 'all'
        status = "all", // 'active' | 'suspended' | 'blocked' | 'pending' | 'all'
        search = "",
        page = 1,
        limit = 10,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 10);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      // Construir query base
      let whereConditions: string[] = ["u.deleted_at IS NULL"];
      const params: any[] = [];

      // Filtro por tipo
      if (type === "talents") {
        whereConditions.push("u.user_type = 'talent'");
      } else if (type === "companies") {
        whereConditions.push("u.user_type = 'company'");
      }

      // Filtro por status
      if (status !== "all") {
        if (status === "suspended" || status === "blocked") {
          whereConditions.push("u.is_active = FALSE");
        } else if (status === "active") {
          whereConditions.push("u.is_active = TRUE");
        } else if (status === "pending") {
          // Para empresas, verificar approval_status
          if (type === "companies" || type === "all") {
            whereConditions.push(
              "(u.user_type = 'company' AND EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id = u.id AND cu.approval_status = 'pending'))",
            );
          }
        }
      }

      // Busca por texto
      if (search) {
        const searchCondition = `(
          u.email LIKE ? OR
          (u.user_type = 'talent' AND EXISTS (
            SELECT 1 FROM talent_users tu 
            WHERE tu.user_id = u.id 
            AND (tu.first_name LIKE ? OR tu.last_name LIKE ?)
          )) OR
          (u.user_type = 'company' AND EXISTS (
            SELECT 1 FROM company_users cu 
            WHERE cu.user_id = u.id 
            AND cu.company_name LIKE ?
          ))
        )`;
        whereConditions.push(searchCondition);
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(" AND ")}`
          : "";

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(DISTINCT u.id) as total FROM users u ${whereClause}`,
        params,
      );

      const total = countResult?.total || 0;

      // Buscar perfis
      const profiles = await query<any>(
        `SELECT 
          u.id,
          u.email,
          u.user_type,
          u.is_active,
          u.email_verified,
          u.last_login_at,
          u.created_at,
          CASE 
            WHEN u.user_type = 'talent' THEN 
              (SELECT CONCAT(tu.first_name, ' ', tu.last_name) FROM talent_users tu WHERE tu.user_id = u.id)
            WHEN u.user_type = 'company' THEN 
              (SELECT cu.company_name FROM company_users cu WHERE cu.user_id = u.id)
            ELSE NULL
          END as name,
          CASE 
            WHEN u.user_type = 'talent' THEN 
              (SELECT tu.profile_picture_url FROM talent_users tu WHERE tu.user_id = u.id)
            WHEN u.user_type = 'company' THEN 
              (SELECT cp.logo_url FROM company_profiles cp 
               JOIN company_users cu ON cp.company_user_id = cu.id 
               WHERE cu.user_id = u.id)
            ELSE NULL
          END as picture_url
        FROM users u
        ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT ${Math.floor(limitNum)} OFFSET ${Math.floor(offset)}`,
        params,
      );

      // Buscar approval_status para empresas
      const companyApprovals: Record<string, string> = {};
      const companyProfileIds = profiles
        .filter((p: any) => p.user_type === "company")
        .map((p: any) => p.id);
      if (companyProfileIds.length > 0) {
        const placeholders = companyProfileIds.map(() => "?").join(",");
        const companyUsers = await query<any>(
          `SELECT cu.user_id, cu.approval_status, cu.certidao_url
           FROM company_users cu
           WHERE cu.user_id IN (${placeholders})`,
          companyProfileIds,
        );
        companyUsers.forEach((cu: any) => {
          companyApprovals[cu.user_id] = cu.approval_status;
        });
      }

      // Normalizar dados
      const normalizedProfiles = profiles.map((profile: any) => {
        const baseProfile: any = {
          id: profile.id,
          email: profile.email,
          userType: profile.user_type,
          isActive: profile.is_active,
          emailVerified: profile.email_verified,
          lastLoginAt: profile.last_login_at,
          createdAt: profile.created_at,
          name: profile.name,
          pictureUrl: profile.picture_url,
        };

        // Adicionar approvalStatus para empresas
        if (profile.user_type === "company" && companyApprovals[profile.id]) {
          baseProfile.approvalStatus = companyApprovals[profile.id];
        }

        return baseProfile;
      });

      res.status(200).json(
        createSuccessResponse({
          profiles: normalizedProfiles,
          pagination: {
            total,
            page: Number(page),
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
          },
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/profiles/search/talents
   * Buscar talentos por email (autocomplete)
   */
  static async searchTalentsByEmail(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError("Usuário não autenticado", 401);
      }

      const { email = "" } = req.query;

      if (!email || String(email).length < 2) {
        res.status(200).json(createSuccessResponse([], "Busca realizada"));
        return;
      }

      const searchParam = `%${email}%`;

      const talents = await query<any>(
        `SELECT 
          COALESCE(tp.id, CONCAT('temp-', tu.id)) as talentProfileId,
          u.id as userId,
          u.email,
          tu.first_name,
          tu.last_name,
          CONCAT(COALESCE(tu.first_name, ''), ' ', COALESCE(tu.last_name, '')) as full_name,
          COALESCE(tp.has_zolangola_badge, FALSE) as has_zolangola_badge,
          tu.id as talentUserId
        FROM users u
        JOIN talent_users tu ON tu.user_id = u.id
        LEFT JOIN talent_profiles tp ON tp.talent_user_id = tu.id
        WHERE u.user_type = 'talent'
          AND u.deleted_at IS NULL
          AND u.email LIKE ?
        ORDER BY u.email ASC
        LIMIT 10`,
        [searchParam],
      );

      res.status(200).json(createSuccessResponse(talents, "Busca realizada"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/profiles/:id
   * Obter detalhes de um perfil
   */
  static async getProfileDetails(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError("Usuário não autenticado", 401);
      }

      const { id } = req.params;

      // Buscar usuário base
      const user = await queryOne<any>(
        `SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );

      if (!user) {
        throw new CustomError("Perfil não encontrado", 404);
      }

      let profileData: any = {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        isActive: user.is_active,
        emailVerified: user.email_verified,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      };

      // Buscar dados específicos do tipo
      if (user.user_type === "talent") {
        const talentUser = await queryOne<any>(
          `SELECT * FROM talent_users WHERE user_id = ?`,
          [id],
        );

        let talentProfile = null;
        if (talentUser?.id) {
          talentProfile = await queryOne<any>(
            `SELECT * FROM talent_profiles WHERE talent_user_id = ?`,
            [talentUser.id],
          );
        }

        profileData = {
          ...profileData,
          talent: {
            ...talentUser,
            firstName: talentUser?.first_name,
            lastName: talentUser?.last_name,
            profilePictureUrl: talentUser?.profile_picture_url,
            onboardingCompleted: talentUser?.onboarding_completed,
          },
          profile: talentProfile
            ? {
                ...talentProfile,
                hasZolangolaBadge: talentProfile.has_zolangola_badge,
                badgeIssuedAt: talentProfile.badge_issued_at,
                badgeRevokedAt: talentProfile.badge_revoked_at,
              }
            : null,
        };
      } else if (user.user_type === "company") {
        const companyUser = await queryOne<any>(
          `SELECT * FROM company_users WHERE user_id = ?`,
          [id],
        );

        let companyProfile = null;
        if (companyUser?.id) {
          companyProfile = await queryOne<any>(
            `SELECT * FROM company_profiles WHERE company_user_id = ?`,
            [companyUser.id],
          );
        }

        // Buscar informações do responsável (usuário que cadastrou a empresa)
        const responsibleUser = await queryOne<any>(
          `SELECT 
            u.id,
            u.email,
            u.email_verified,
            u.is_active,
            u.last_login_at,
            u.created_at as user_created_at
          FROM users u
          WHERE u.id = ?`,
          [id],
        );

        profileData = {
          ...profileData,
          company: {
            ...companyUser,
            companyName: companyUser?.company_name,
            certidaoUrl: companyUser?.certidao_url,
            approvalStatus: companyUser?.approval_status,
          },
          profile: companyProfile
            ? {
                ...companyProfile,
                logoUrl: companyProfile.logo_url,
                companySize: companyProfile.company_size,
                website: companyProfile.website,
                description: companyProfile.description,
                industry: companyProfile.industry,
                phone: companyProfile.phone,
                address: companyProfile.address,
                city: companyProfile.city,
                province: companyProfile.province,
                country: companyProfile.country,
              }
            : null,
          responsible: responsibleUser
            ? {
                id: responsibleUser.id,
                email: responsibleUser.email,
                emailVerified: responsibleUser.email_verified,
                isActive: responsibleUser.is_active,
                lastLoginAt: responsibleUser.last_login_at,
                createdAt: responsibleUser.user_created_at,
              }
            : null,
        };
      }

      res.status(200).json(createSuccessResponse(profileData));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/profiles/:id/status
   * Atualizar status do perfil (active/suspended/blocked)
   */
  static async updateProfileStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError("Usuário não autenticado", 401);
      }

      const { id } = req.params;
      const { status } = req.body; // 'active' | 'suspended' | 'blocked'

      if (!["active", "suspended", "blocked"].includes(status)) {
        throw new CustomError("Status inválido", 400);
      }

      const isActive = status === "active";

      await execute(
        `UPDATE users SET is_active = ? WHERE id = ? AND deleted_at IS NULL`,
        [isActive, id],
      );

      // Registrar em audit_logs
      const { generateUUID } = await import("../utils/uuid");
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', ?, 'user', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          `update_profile_status_${status}`,
          id,
          JSON.stringify({ status, isActive }),
          req.ip,
          req.get("user-agent"),
        ],
      );

      res
        .status(200)
        .json(
          createSuccessResponse({ message: "Status atualizado com sucesso" }),
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/profiles/:id/approval
   * Aprovar ou rejeitar empresa (apenas para empresas)
   */
  static async updateCompanyApproval(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError("Usuário não autenticado", 401);
      }

      const { id } = req.params;
      const { approvalStatus, reason } = req.body; // 'approved' | 'rejected' | 'pending'

      if (!["approved", "rejected", "pending"].includes(approvalStatus)) {
        throw new CustomError("Status de aprovação inválido", 400);
      }

      // Verificar se é empresa
      const user = await queryOne<any>(
        `SELECT user_type FROM users WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );

      if (!user || user.user_type !== "company") {
        throw new CustomError(
          "Apenas perfis de empresas podem ser aprovados/rejeitados",
          400,
        );
      }

      // Verificar se existe company_user
      const companyUser = await queryOne<any>(
        `SELECT id FROM company_users WHERE user_id = ?`,
        [id],
      );

      if (!companyUser) {
        throw new CustomError("Perfil de empresa não encontrado", 404);
      }

      // Atualizar approval_status
      await execute(
        `UPDATE company_users 
         SET approval_status = ? 
         WHERE user_id = ?`,
        [approvalStatus, id],
      );

      // Se aprovado, também ativar o usuário
      if (approvalStatus === "approved") {
        await execute(`UPDATE users SET is_active = TRUE WHERE id = ?`, [id]);
      }

      // Registrar em audit_logs
      const { generateUUID } = await import("../utils/uuid");
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', ?, 'company_user', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          `update_company_approval_${approvalStatus}`,
          companyUser.id,
          JSON.stringify({ approvalStatus, reason: reason || null }),
          req.ip,
          req.get("user-agent"),
        ],
      );

      res.status(200).json(
        createSuccessResponse({
          message:
            approvalStatus === "approved"
              ? "Empresa aprovada com sucesso"
              : approvalStatus === "rejected"
                ? "Empresa rejeitada"
                : "Status de aprovação atualizado",
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/profiles/:id/verify
   * Verificar perfil (apenas para talentos)
   */
  static async verifyProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError("Usuário não autenticado", 401);
      }

      const { id } = req.params;

      // Verificar se é talento
      const user = await queryOne<any>(
        `SELECT user_type FROM users WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );

      if (!user || user.user_type !== "talent") {
        throw new CustomError(
          "Apenas perfis de talentos podem ser verificados",
          400,
        );
      }

      let talentUser = await queryOne<any>(
        `SELECT id FROM talent_users WHERE user_id = ?`,
        [id],
      );

      // Se não existe talent_user, criar um básico
      if (!talentUser) {
        const { generateUUID } = await import("../utils/uuid");
        const talentUserId = generateUUID();
        await execute(
          `INSERT INTO talent_users (id, user_id, first_name, last_name, onboarding_completed)
           VALUES (?, ?, ?, ?, FALSE)`,
          [talentUserId, id, "Nome", "Apelido"], // Valores padrão que o utilizador pode atualizar depois
        );
        talentUser = { id: talentUserId };
      }

      // Verificar se existe talent_profile, se não, criar um básico
      let talentProfile = await queryOne<any>(
        `SELECT id FROM talent_profiles WHERE talent_user_id = ?`,
        [talentUser.id],
      );

      if (!talentProfile) {
        const { generateUUID } = await import("../utils/uuid");
        const profileId = generateUUID();
        await execute(
          `INSERT INTO talent_profiles (id, talent_user_id, is_verified, profile_visibility)
           VALUES (?, ?, FALSE, 'public')`,
          [profileId, talentUser.id],
        );
        talentProfile = { id: profileId };
      }

      // Atualizar talent_profiles
      await execute(
        `UPDATE talent_profiles 
         SET is_verified = TRUE, verified_at = NOW() 
         WHERE talent_user_id = ?`,
        [talentUser.id],
      );

      // Registrar em audit_logs
      const { generateUUID } = await import("../utils/uuid");
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'verify_profile', 'talent_profile', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          talentUser.id,
          JSON.stringify({
            verified: true,
            verifiedAt: new Date().toISOString(),
          }),
          req.ip,
          req.get("user-agent"),
        ],
      );

      res
        .status(200)
        .json(
          createSuccessResponse({ message: "Perfil verificado com sucesso" }),
        );
    } catch (error) {
      next(error);
    }
  }
}
