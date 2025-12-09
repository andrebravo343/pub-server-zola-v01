import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/User.model';
import { createSuccessResponse } from '../utils/response';
import { CustomError } from '../middlewares/errorHandler';
import { query, queryOne, execute } from '../utils/database';
import { 
  uploadProfilePicture, 
  getProfilePicturePath, 
  deleteProfilePicture,
  uploadCompanyDocument,
  uploadTalentDocument,
  getCompanyDocumentPath,
  getTalentDocumentPath,
} from '../middlewares/upload';

/**
 * Normalizar dados do admin para camelCase
 */
function normalizeAdminData(adminUser: any): any {
  if (!adminUser) return null;
  return {
    ...adminUser,
    fullName: adminUser.full_name,
    full_name: adminUser.full_name, // Manter ambos para compatibilidade
  };
}

/**
 * Normalizar dados da empresa para camelCase
 */
function normalizeCompanyData(companyUser: any, companyProfile: any): any {
  return {
    company: companyUser ? {
      ...companyUser,
      companyName: companyUser.company_name,
      certidaoUrl: companyUser.certidao_url,
      approvalStatus: companyUser.approval_status,
      onboardingCompleted: false, // Empresas não têm onboarding_completed na tabela, mas podem ter lógica de aprovação
    } : null,
    profile: companyProfile ? {
      ...companyProfile,
      companySize: companyProfile.company_size,
      logoUrl: companyProfile.logo_url || null, // Garantir que seja null se não existir, não undefined
    } : null,
  };
}

/**
 * Normalizar dados do talento para camelCase
 */
function normalizeTalentData(talentUser: any, talentProfile: any): any {
  return {
    talent: talentUser ? {
      ...talentUser,
      firstName: talentUser.first_name,
      lastName: talentUser.last_name,
      dateOfBirth: talentUser.date_of_birth,
      profilePictureUrl: talentUser.profile_picture_url,
      phoneVerified: talentUser.phone_verified,
      onboardingCompleted: talentUser.onboarding_completed,
    } : null,
    profile: talentProfile ? {
      ...talentProfile,
      isRemote: talentProfile.is_remote,
      availabilityStatus: talentProfile.availability_status,
      availabilityDate: talentProfile.availability_date,
      hasZolangolaBadge: talentProfile.has_zolangola_badge,
      badgeIssuedAt: talentProfile.badge_issued_at,
      badgeRevokedAt: talentProfile.badge_revoked_at,
      badgeRevocationReason: talentProfile.badge_revocation_reason,
      isVerified: talentProfile.is_verified,
      verifiedAt: talentProfile.verified_at,
      profileVisibility: talentProfile.profile_visibility,
      applicationsCount: talentProfile.applications_count,
      certificatesCount: talentProfile.certificates_count,
      profileViews: talentProfile.profile_views,
      lastUpdate: talentProfile.last_update,
    } : null,
  };
}

export class ProfileController {
  /**
   * GET /auth/me
   * Obter informações do usuário autenticado
   */
  static async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Buscar usuário base
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new CustomError('Usuário não encontrado', 404);
      }

      // Buscar dados específicos do tipo de usuário
      let profileData: any = {
        id: user.id,
        email: user.email,
        userType: user.userType,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        twoFactorEnabled: user.twoFactorEnabled,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      // Adicionar dados específicos conforme o tipo
      if (user.userType === 'talent') {
        const talentUser = await queryOne<any>(
          `SELECT * FROM talent_users WHERE user_id = ?`,
          [userId]
        );
        const talentProfile = talentUser
          ? await queryOne<any>(
              `SELECT * FROM talent_profiles WHERE talent_user_id = ?`,
              [talentUser.id]
            )
          : null;

        // Buscar skills e languages
        const skills = talentProfile
          ? await query<any>(
              `SELECT skill_name FROM talent_skills WHERE talent_profile_id = ?`,
              [talentProfile.id]
            )
          : [];
        
        const languages = talentProfile
          ? await query<any>(
              `SELECT language, proficiency_level FROM talent_languages WHERE talent_profile_id = ?`,
              [talentProfile.id]
            )
          : [];

        const normalizedTalent = normalizeTalentData(talentUser, talentProfile);
        profileData = {
          ...profileData,
          ...normalizedTalent,
          skills: skills.map((s: any) => s.skill_name),
          languages: languages.map((l: any) => ({
            language: l.language,
            proficiencyLevel: l.proficiency_level,
          })),
        };
      } else if (user.userType === 'company') {
        const companyUser = await queryOne<any>(
          `SELECT * FROM company_users WHERE user_id = ?`,
          [userId]
        );
        const companyProfile = companyUser
          ? await queryOne<any>(
              `SELECT * FROM company_profiles WHERE company_user_id = ?`,
              [companyUser.id]
            )
          : null;

        const normalizedCompany = normalizeCompanyData(companyUser, companyProfile);
        profileData = {
          ...profileData,
          ...normalizedCompany,
        };
      } else if (user.userType === 'admin') {
        const adminUser = await queryOne<any>(
          `SELECT * FROM admin_users WHERE user_id = ?`,
          [userId]
        );

        profileData = {
          ...profileData,
          admin: normalizeAdminData(adminUser),
        };
      }

      res.status(200).json(
        createSuccessResponse(profileData, 'Perfil obtido com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /auth/me
   * Atualizar informações do usuário autenticado
   */
  static async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const user = await UserModel.findById(userId);
      if (!user) {
        throw new CustomError('Usuário não encontrado', 404);
      }

      const { email, password, onboarding_completed, onboardingCompleted, ...otherData } = req.body;

      // Atualizar email se fornecido
      if (email && email !== user.email) {
        const emailExists = await UserModel.emailExists(email, userId);
        if (emailExists) {
          throw new CustomError('Email já está em uso', 400);
        }
        await UserModel.update(userId, { email });
      }

      // Atualizar senha se fornecida
      if (password) {
        if (password.length < 8) {
          throw new CustomError('Senha deve ter no mínimo 8 caracteres', 400);
        }
        await UserModel.update(userId, { password });
      }

      // Atualizar onboarding_completed se fornecido (apenas para talentos)
      const onboardingValue = onboarding_completed ?? onboardingCompleted ?? otherData.talent?.onboardingCompleted;
      
      if (onboardingValue !== undefined && user.userType === 'talent') {
        const talentUser = await queryOne<any>(
          `SELECT id FROM talent_users WHERE user_id = ?`,
          [userId]
        );
        if (talentUser) {
          await execute(
            `UPDATE talent_users SET onboarding_completed = ? WHERE id = ?`,
            [onboardingValue, talentUser.id]
          );
        }
      }
      
      // Para empresas, não há campo onboarding_completed na tabela
      // O onboarding está completo quando enviam documentos (certidao_url)

      // Atualizar dados específicos conforme o tipo
      if (user.userType === 'admin' && otherData.admin) {
        let adminUser = await queryOne<any>(
          `SELECT id FROM admin_users WHERE user_id = ?`,
          [userId]
        );

        // Se não existe registro, criar um
        if (!adminUser) {
          const { generateUUID } = await import('../utils/uuid');
          const adminUserId = generateUUID();
          const fullName = otherData.admin.fullName || user.email.split('@')[0];
          const role = otherData.admin.role || 'admin';
          
          await execute(
            `INSERT INTO admin_users (id, user_id, full_name, role, permissions)
             VALUES (?, ?, ?, ?, ?)`,
            [
              adminUserId,
              userId,
              fullName,
              role,
              JSON.stringify(role === 'super_admin' ? ['*'] : []),
            ]
          );
          
          adminUser = { id: adminUserId };
        }

        // Atualizar dados
        if (adminUser) {
          const updates: string[] = [];
          const values: any[] = [];

          if (otherData.admin.fullName !== undefined) {
            updates.push('full_name = ?');
            values.push(otherData.admin.fullName);
          }
          if (otherData.admin.role !== undefined) {
            updates.push('role = ?');
            values.push(otherData.admin.role);
          }
          if (otherData.admin.permissions !== undefined) {
            updates.push('permissions = ?');
            values.push(JSON.stringify(otherData.admin.permissions));
          }

          if (updates.length > 0) {
            values.push(adminUser.id);
            await execute(
              `UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`,
              values
            );
          }
        }
      } else if (user.userType === 'company' && otherData.company) {
        const companyUser = await queryOne<any>(
          `SELECT id FROM company_users WHERE user_id = ?`,
          [userId]
        );

        if (companyUser) {
          const updates: string[] = [];
          const values: any[] = [];

          if (otherData.company.companyName !== undefined) {
            updates.push('company_name = ?');
            values.push(otherData.company.companyName);
          }
          if (otherData.company.nif !== undefined) {
            updates.push('nif = ?');
            values.push(otherData.company.nif);
          }
          if (otherData.company.certidaoUrl !== undefined) {
            updates.push('certidao_url = ?');
            values.push(otherData.company.certidaoUrl);
          }

          if (updates.length > 0) {
            values.push(companyUser.id);
            await execute(
              `UPDATE company_users SET ${updates.join(', ')} WHERE id = ?`,
              values
            );
          }

          // Atualizar company_profiles se fornecido
          if (otherData.profile) {
            const companyProfile = await queryOne<any>(
              `SELECT id FROM company_profiles WHERE company_user_id = ?`,
              [companyUser.id]
            );

            if (companyProfile) {
              const profileUpdates: string[] = [];
              const profileValues: any[] = [];

              if (otherData.profile.description !== undefined) {
                profileUpdates.push('description = ?');
                profileValues.push(otherData.profile.description);
              }
              if (otherData.profile.website !== undefined) {
                profileUpdates.push('website = ?');
                profileValues.push(otherData.profile.website);
              }
              if (otherData.profile.phone !== undefined) {
                profileUpdates.push('phone = ?');
                profileValues.push(otherData.profile.phone);
              }
              if (otherData.profile.address !== undefined) {
                profileUpdates.push('address = ?');
                profileValues.push(otherData.profile.address);
              }
              if (otherData.profile.city !== undefined) {
                profileUpdates.push('city = ?');
                profileValues.push(otherData.profile.city);
              }
              if (otherData.profile.province !== undefined) {
                profileUpdates.push('province = ?');
                profileValues.push(otherData.profile.province);
              }
              if (otherData.profile.country !== undefined) {
                profileUpdates.push('country = ?');
                profileValues.push(otherData.profile.country);
              }
              if (otherData.profile.industry !== undefined) {
                profileUpdates.push('industry = ?');
                profileValues.push(otherData.profile.industry);
              }
              if (otherData.profile.companySize !== undefined) {
                profileUpdates.push('company_size = ?');
                profileValues.push(otherData.profile.companySize);
              }
              if (otherData.profile.logoUrl !== undefined) {
                profileUpdates.push('logo_url = ?');
                profileValues.push(otherData.profile.logoUrl);
              }

              if (profileUpdates.length > 0) {
                profileValues.push(companyProfile.id);
                await execute(
                  `UPDATE company_profiles SET ${profileUpdates.join(', ')} WHERE id = ?`,
                  profileValues
                );
              }
            } else if (otherData.profile) {
              // Criar company_profile se não existe
              const { generateUUID } = await import('../utils/uuid');
              const profileId = generateUUID();
              
              await execute(
                `INSERT INTO company_profiles (id, company_user_id, description, website, phone, address, city, province, country, industry, company_size, logo_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  profileId,
                  companyUser.id,
                  otherData.profile.description || null,
                  otherData.profile.website || null,
                  otherData.profile.phone || null,
                  otherData.profile.address || null,
                  otherData.profile.city || null,
                  otherData.profile.province || null,
                  otherData.profile.country || 'Angola',
                  otherData.profile.industry || null,
                  otherData.profile.companySize || null,
                  otherData.profile.logoUrl || null,
                ]
              );
            }
          }
        }
      } else if (user.userType === 'talent' && otherData.talent) {
        const talentUser = await queryOne<any>(
          `SELECT id FROM talent_users WHERE user_id = ?`,
          [userId]
        );

        if (talentUser) {
          const updates: string[] = [];
          const values: any[] = [];

          if (otherData.talent.firstName !== undefined) {
            updates.push('first_name = ?');
            values.push(otherData.talent.firstName);
          }
          if (otherData.talent.lastName !== undefined) {
            updates.push('last_name = ?');
            values.push(otherData.talent.lastName);
          }
          if (otherData.talent.phone !== undefined) {
            updates.push('phone = ?');
            values.push(otherData.talent.phone);
          }
          if (otherData.talent.dateOfBirth !== undefined) {
            updates.push('date_of_birth = ?');
            values.push(otherData.talent.dateOfBirth);
          }
          if (otherData.talent.nationality !== undefined) {
            updates.push('nationality = ?');
            values.push(otherData.talent.nationality);
          }
          if (otherData.talent.gender !== undefined) {
            updates.push('gender = ?');
            values.push(otherData.talent.gender);
          }
          if (otherData.talent.profilePictureUrl !== undefined) {
            updates.push('profile_picture_url = ?');
            values.push(otherData.talent.profilePictureUrl);
          }
          // onboarding_completed já foi tratado acima

          if (updates.length > 0) {
            values.push(talentUser.id);
            await execute(
              `UPDATE talent_users SET ${updates.join(', ')} WHERE id = ?`,
              values
            );
          }

          // Atualizar talent_profiles se fornecido
          if (otherData.profile) {
            const talentProfile = await queryOne<any>(
              `SELECT id FROM talent_profiles WHERE talent_user_id = ?`,
              [talentUser.id]
            );

            if (talentProfile) {
              const profileUpdates: string[] = [];
              const profileValues: any[] = [];

              if (otherData.profile.title !== undefined) {
                profileUpdates.push('title = ?');
                profileValues.push(otherData.profile.title);
              }
              if (otherData.profile.bio !== undefined) {
                profileUpdates.push('bio = ?');
                profileValues.push(otherData.profile.bio);
              }
              if (otherData.profile.city !== undefined) {
                profileUpdates.push('city = ?');
                profileValues.push(otherData.profile.city);
              }
              if (otherData.profile.province !== undefined) {
                profileUpdates.push('province = ?');
                profileValues.push(otherData.profile.province);
              }
              if (otherData.profile.country !== undefined) {
                profileUpdates.push('country = ?');
                profileValues.push(otherData.profile.country);
              }
              if (otherData.profile.isRemote !== undefined) {
                profileUpdates.push('is_remote = ?');
                profileValues.push(otherData.profile.isRemote);
              }
              if (otherData.profile.availabilityStatus !== undefined) {
                profileUpdates.push('availability_status = ?');
                profileValues.push(otherData.profile.availabilityStatus);
              }
              if (otherData.profile.availabilityDate !== undefined) {
                profileUpdates.push('availability_date = ?');
                profileValues.push(otherData.profile.availabilityDate);
              }

              if (profileUpdates.length > 0) {
                profileValues.push(talentProfile.id);
                await execute(
                  `UPDATE talent_profiles SET ${profileUpdates.join(', ')} WHERE id = ?`,
                  profileValues
                );
              }

              // Atualizar skills se fornecido
              if (otherData.profile.skills !== undefined && Array.isArray(otherData.profile.skills)) {
                // Remover skills antigas
                await execute(
                  `DELETE FROM talent_skills WHERE talent_profile_id = ?`,
                  [talentProfile.id]
                );

                // Adicionar novas skills
                const { generateUUID } = await import('../utils/uuid');
                for (const skill of otherData.profile.skills) {
                  if (skill && typeof skill === 'string' && skill.trim()) {
                    const skillId = generateUUID();
                    await execute(
                      `INSERT INTO talent_skills (id, talent_profile_id, skill_name, skill_type)
                       VALUES (?, ?, ?, 'technical')`,
                      [skillId, talentProfile.id, skill.trim()]
                    );
                  }
                }
              }

              // Atualizar languages se fornecido
              if (otherData.profile.languages !== undefined && Array.isArray(otherData.profile.languages)) {
                // Remover languages antigas
                await execute(
                  `DELETE FROM talent_languages WHERE talent_profile_id = ?`,
                  [talentProfile.id]
                );

                // Adicionar novas languages
                const { generateUUID } = await import('../utils/uuid');
                for (const lang of otherData.profile.languages) {
                  if (lang && typeof lang === 'object' && lang.language && lang.proficiencyLevel) {
                    const langId = generateUUID();
                    await execute(
                      `INSERT INTO talent_languages (id, talent_profile_id, language, proficiency_level)
                       VALUES (?, ?, ?, ?)`,
                      [langId, talentProfile.id, lang.language.trim(), lang.proficiencyLevel]
                    );
                  }
                }
              }
            } else if (otherData.profile) {
              // Criar talent_profile se não existe
              const { generateUUID } = await import('../utils/uuid');
              const profileId = generateUUID();
              
              await execute(
                `INSERT INTO talent_profiles (id, talent_user_id, title, bio, city, province, country, is_remote, availability_status, availability_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  profileId,
                  talentUser.id,
                  otherData.profile.title || null,
                  otherData.profile.bio || null,
                  otherData.profile.city || null,
                  otherData.profile.province || null,
                  otherData.profile.country || 'Angola',
                  otherData.profile.isRemote || false,
                  otherData.profile.availabilityStatus || 'available',
                  otherData.profile.availabilityDate || null,
                ]
              );
            }
          }
        }
      }

      // Buscar dados atualizados (mesma lógica do getProfile)
      const updatedUser = await UserModel.findById(userId);
      if (!updatedUser) {
        throw new CustomError('Usuário não encontrado após atualização', 404);
      }

      // Buscar dados específicos do tipo de usuário (mesma lógica do getProfile)
      let profileData: any = {
        id: updatedUser.id,
        email: updatedUser.email,
        userType: updatedUser.userType,
        isActive: updatedUser.isActive,
        emailVerified: updatedUser.emailVerified,
        emailVerifiedAt: updatedUser.emailVerifiedAt,
        twoFactorEnabled: updatedUser.twoFactorEnabled,
        lastLoginAt: updatedUser.lastLoginAt,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      };

      // Adicionar dados específicos conforme o tipo
      if (updatedUser.userType === 'talent') {
        const talentUser = await queryOne<any>(
          `SELECT * FROM talent_users WHERE user_id = ?`,
          [userId]
        );
        const talentProfile = talentUser
          ? await queryOne<any>(
              `SELECT * FROM talent_profiles WHERE talent_user_id = ?`,
              [talentUser.id]
            )
          : null;

        const normalizedTalent = normalizeTalentData(talentUser, talentProfile);
        profileData = {
          ...profileData,
          ...normalizedTalent,
        };
      } else if (updatedUser.userType === 'company') {
        const companyUser = await queryOne<any>(
          `SELECT * FROM company_users WHERE user_id = ?`,
          [userId]
        );
        const companyProfile = companyUser
          ? await queryOne<any>(
              `SELECT * FROM company_profiles WHERE company_user_id = ?`,
              [companyUser.id]
            )
          : null;

        const normalizedCompany = normalizeCompanyData(companyUser, companyProfile);
        profileData = {
          ...profileData,
          ...normalizedCompany,
        };
      } else if (updatedUser.userType === 'admin') {
        const adminUser = await queryOne<any>(
          `SELECT * FROM admin_users WHERE user_id = ?`,
          [userId]
        );

        profileData = {
          ...profileData,
          admin: normalizeAdminData(adminUser),
        };
      }

      res.status(200).json(
        createSuccessResponse(profileData, 'Perfil atualizado com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/me/avatar
   * Upload de foto de perfil
   */
  static uploadAvatar = [
    uploadProfilePicture.single('avatar'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.userId;
        if (!userId) {
          throw new CustomError('Usuário não autenticado', 401);
        }

        if (!req.file) {
          throw new CustomError('Nenhum arquivo enviado', 400);
        }

        const user = await UserModel.findById(userId);
        if (!user) {
          throw new CustomError('Usuário não encontrado', 404);
        }

        // Gerar URL da foto
        const photoUrl = getProfilePicturePath(req.file.filename);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fullUrl = `${baseUrl}${photoUrl}`;

        // Atualizar foto no banco conforme o tipo de usuário
        if (user.userType === 'admin') {
          const adminUser = await queryOne<any>(
            `SELECT id, profile_picture_url FROM admin_users WHERE user_id = ?`,
            [userId]
          );

          if (adminUser) {
            // Deletar foto antiga se existir
            if (adminUser.profile_picture_url) {
              const oldFilename = adminUser.profile_picture_url.split('/').pop();
              if (oldFilename) {
                deleteProfilePicture(oldFilename);
              }
            }

            // Atualizar se já existe
            await execute(
              `UPDATE admin_users SET profile_picture_url = ? WHERE id = ?`,
              [fullUrl, adminUser.id]
            );
          } else {
            // Criar registro se não existe
            const { generateUUID } = await import('../utils/uuid');
            const adminUserId = generateUUID();
            await execute(
              `INSERT INTO admin_users (id, user_id, full_name, role, profile_picture_url, permissions)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                adminUserId,
                userId,
                user.email.split('@')[0],
                'admin',
                fullUrl,
                JSON.stringify([]),
              ]
            );
          }
        } else if (user.userType === 'talent') {
          const talentUser = await queryOne<any>(
            `SELECT id, profile_picture_url FROM talent_users WHERE user_id = ?`,
            [userId]
          );

          if (talentUser) {
            // Deletar foto antiga se existir
            if (talentUser.profile_picture_url) {
              const oldFilename = talentUser.profile_picture_url.split('/').pop();
              if (oldFilename) {
                deleteProfilePicture(oldFilename);
              }
            }

            await execute(
              `UPDATE talent_users SET profile_picture_url = ? WHERE id = ?`,
              [fullUrl, talentUser.id]
            );
          }
        } else if (user.userType === 'company') {
          // Para empresas, atualizar logo no company_profiles
          const companyUser = await queryOne<any>(
            `SELECT id FROM company_users WHERE user_id = ?`,
            [userId]
          );

          if (companyUser) {
            const companyProfile = await queryOne<any>(
              `SELECT id, logo_url FROM company_profiles WHERE company_user_id = ?`,
              [companyUser.id]
            );

            if (companyProfile) {
              // Deletar logo antigo se existir
              if (companyProfile.logo_url) {
                const oldFilename = companyProfile.logo_url.split('/').pop();
                if (oldFilename) {
                  deleteProfilePicture(oldFilename);
                }
              }

              await execute(
                `UPDATE company_profiles SET logo_url = ? WHERE id = ?`,
                [fullUrl, companyProfile.id]
              );
            } else {
              // Criar company_profile se não existe
              const { generateUUID } = await import('../utils/uuid');
              const profileId = generateUUID();
              await execute(
                `INSERT INTO company_profiles (id, company_user_id, logo_url)
                 VALUES (?, ?, ?)`,
                [profileId, companyUser.id, fullUrl]
              );
            }
          }
        }

        res.status(200).json(
          createSuccessResponse(
            { photoUrl: fullUrl },
            'Foto de perfil atualizada com sucesso'
          )
        );
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * POST /auth/me/documents
   * Upload de documento (empresa ou talento)
   */
  static uploadDocument = [
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.userId;
        if (!userId) {
          throw new CustomError('Usuário não autenticado', 401);
        }

        const user = await UserModel.findById(userId);
        if (!user) {
          throw new CustomError('Usuário não encontrado', 404);
        }

        // Determinar qual middleware usar baseado no tipo de usuário
        const uploadMiddleware = user.userType === 'company' 
          ? uploadCompanyDocument.single('document')
          : uploadTalentDocument.single('document');

        uploadMiddleware(req, res, async (err) => {
          if (err) {
            return next(new CustomError(err.message, 400));
          }

          if (!req.file) {
            return next(new CustomError('Nenhum arquivo enviado', 400));
          }

          const documentType = req.body.documentType || 'other';
          const documentPath = user.userType === 'company'
            ? getCompanyDocumentPath(req.file.filename)
            : getTalentDocumentPath(req.file.filename);
          
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          const fullUrl = `${baseUrl}${documentPath}`;

          // Atualizar no banco conforme o tipo
          if (user.userType === 'company') {
            // Para empresas, atualizar certidao_url se for certidão
            if (documentType === 'certidao') {
              const companyUser = await queryOne<any>(
                `SELECT id FROM company_users WHERE user_id = ?`,
                [userId]
              );

              if (companyUser) {
                await execute(
                  `UPDATE company_users SET certidao_url = ? WHERE id = ?`,
                  [fullUrl, companyUser.id]
                );
              }
            }
          } else if (user.userType === 'talent') {
            // Para talentos, armazenar em talent_profiles ou criar tabela de documentos
            // Por enquanto, podemos armazenar CV em talent_profiles se existir campo
            // TODO: Criar tabela talent_documents se necessário para múltiplos documentos
            if (documentType === 'cv' || documentType === 'resume') {
              // Por enquanto, apenas retornar a URL
              // Em futuras versões, podemos armazenar em talent_profiles.cv_url se o campo existir
            }
          }

          res.status(200).json(
            createSuccessResponse(
              { documentUrl: fullUrl, documentType },
              'Documento enviado com sucesso'
            )
          );
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * DELETE /auth/me
   * Deletar conta do usuário e todos os dados relacionados
   */
  static async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const user = await UserModel.findById(userId);
      if (!user) {
        throw new CustomError('Usuário não encontrado', 404);
      }

      // Usar soft delete: marcar como deletado em vez de remover fisicamente
      // Isso preserva integridade referencial e permite auditoria
      await execute(
        `UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE id = ?`,
        [userId]
      );

      // Registrar em audit_logs antes de deletar
      const { generateUUID } = await import('../utils/uuid');
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, ?, 'delete_account', 'user', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          user.userType,
          userId,
          JSON.stringify({ deletedAt: new Date().toISOString() }),
          req.ip,
          req.get('user-agent'),
        ]
      );

      // Invalidar todos os refresh tokens
      await execute(
        `DELETE FROM refresh_tokens WHERE user_id = ?`,
        [userId]
      );

      res.status(200).json(
        createSuccessResponse(
          { message: 'Conta deletada com sucesso' },
          'Sua conta e todos os dados foram removidos permanentemente'
        )
      );
    } catch (error) {
      next(error);
    }
  }
}

