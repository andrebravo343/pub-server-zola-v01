import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne } from '../../utils/database';
import { getOrCreateCompanyProfileId } from '../../utils/companyHelper';

export class CompanyCandidatesController {
  /**
   * GET /company/candidates
   * Buscar candidatos com filtros avançados
   */
  static async searchCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        search = '',
        skills = '',
        location = '',
        hasZolangolaBadge,
        availability = '',
        page = 1,
        limit = 20,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      // Verificar perfis completos: nome, telefone, título, bio, localização, skills
      const whereConditions: string[] = [
        'tp.is_verified = TRUE',
        'tu.first_name IS NOT NULL AND tu.first_name != ""',
        'tu.last_name IS NOT NULL AND tu.last_name != ""',
        'tu.phone IS NOT NULL AND tu.phone != ""',
        'tp.title IS NOT NULL AND tp.title != ""',
        'tp.bio IS NOT NULL AND tp.bio != ""',
        '(tp.city IS NOT NULL OR tp.country IS NOT NULL)',
        'EXISTS (SELECT 1 FROM talent_skills ts WHERE ts.talent_profile_id = tp.id)'
      ];
      const params: any[] = [];

      // Busca por texto (nome, email)
      if (search) {
        whereConditions.push(
          '(tu.first_name LIKE ? OR tu.last_name LIKE ? OR u.email LIKE ?)'
        );
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }

      // Filtro por skills (usando tabela talent_skills)
      if (skills) {
        const skillsArray = (skills as string).split(',').map(s => s.trim());
        if (skillsArray.length > 0) {
          whereConditions.push(
            `EXISTS (SELECT 1 FROM talent_skills ts WHERE ts.talent_profile_id = tp.id AND ts.skill_name IN (${skillsArray.map(() => '?').join(',')}))`
          );
          skillsArray.forEach(skill => {
            params.push(skill);
          });
        }
      }

      // Filtro por localização (usando city e province)
      if (location) {
        whereConditions.push('(tp.city LIKE ? OR tp.province LIKE ?)');
        const locationParam = `%${location}%`;
        params.push(locationParam, locationParam);
      }

      // Filtro por badge ZOLANGOLA
      if (hasZolangolaBadge !== undefined) {
        whereConditions.push('tp.has_zolangola_badge = ?');
        params.push(hasZolangolaBadge === 'true' ? 1 : 0);
      }

      // Filtro por disponibilidade (usando availability_status)
      if (availability) {
        const availabilityMap: { [key: string]: string } = {
          'disponivel': 'available',
          'empregado': 'employed',
          'em_processo': 'in_process',
        };
        if (availabilityMap[availability as string]) {
          whereConditions.push('tp.availability_status = ?');
          params.push(availabilityMap[availability as string]);
        }
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(DISTINCT tp.id) as total
         FROM talent_profiles tp
         INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
         INNER JOIN users u ON tu.user_id = u.id
         ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      // Buscar candidatos
      const candidates = await query<any>(
        `SELECT 
          tp.id,
          u.email,
          tp.has_zolangola_badge,
          tp.title,
          tp.city,
          tp.province,
          tp.country,
          tp.bio,
          tp.availability_status,
          tp.created_at,
          tp.updated_at,
          tu.first_name,
          tu.last_name,
          tu.phone,
          tu.profile_picture_url,
          tu.date_of_birth,
          tu.nationality,
          tu.gender,
          (SELECT GROUP_CONCAT(ts.skill_name) FROM talent_skills ts WHERE ts.talent_profile_id = tp.id) as skills
        FROM talent_profiles tp
        INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
        INNER JOIN users u ON tu.user_id = u.id
        ${whereClause}
        ORDER BY tp.has_zolangola_badge DESC, tp.created_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Normalizar dados
      const normalizedCandidates = candidates.map((candidate: any) => ({
        id: candidate.id,
        firstName: candidate.first_name,
        lastName: candidate.last_name,
        fullName: `${candidate.first_name} ${candidate.last_name}`,
        email: candidate.email,
        phone: candidate.phone,
        profilePictureUrl: candidate.profile_picture_url,
        dateOfBirth: candidate.date_of_birth,
        nationality: candidate.nationality,
        gender: candidate.gender,
        hasZolangolaBadge: Boolean(candidate.has_zolangola_badge),
        title: candidate.title,
        location: `${candidate.city || ''} ${candidate.province || ''}`.trim() || candidate.country || 'Angola',
        city: candidate.city,
        province: candidate.province,
        country: candidate.country,
        bio: candidate.bio,
        skills: candidate.skills ? candidate.skills.split(',') : [],
        availabilityStatus: candidate.availability_status,
        availability: candidate.availability_status === 'available' ? 'disponivel' : candidate.availability_status === 'employed' ? 'empregado' : 'em_processo',
        createdAt: candidate.created_at,
        updatedAt: candidate.updated_at,
      }));

      res.status(200).json(
        createSuccessResponse({
          candidates: normalizedCandidates,
          pagination: {
            total,
            page: pageNum,
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
   * GET /company/candidates/:id
   * Obter perfil completo de um candidato
   */
  static async getCandidateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Buscar perfil do candidato
      const candidate = await queryOne<any>(
        `SELECT 
          tp.*,
          u.email,
          tu.first_name,
          tu.last_name,
          tu.phone,
          tu.profile_picture_url,
          tu.date_of_birth,
          tu.nationality,
          tu.gender,
          tu.created_at as user_created_at,
          (SELECT GROUP_CONCAT(ts.skill_name) FROM talent_skills ts WHERE ts.talent_profile_id = tp.id) as skills,
          (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', te.id, 'position', te.position, 'company', te.company, 'startDate', te.start_date, 'endDate', te.end_date, 'isCurrent', te.is_current, 'description', te.description)) FROM talent_experience te WHERE te.talent_profile_id = tp.id ORDER BY te.order_index) as experience,
          (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', ted.id, 'degree', ted.degree, 'institution', ted.institution, 'startYear', ted.start_year, 'endYear', ted.end_year, 'fieldOfStudy', ted.field_of_study)) FROM talent_education ted WHERE ted.talent_profile_id = tp.id ORDER BY ted.order_index) as education,
          (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', tl.id, 'language', tl.language, 'proficiencyLevel', tl.proficiency_level)) FROM talent_languages tl WHERE tl.talent_profile_id = tp.id) as languages
        FROM talent_profiles tp
        INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
        INNER JOIN users u ON tu.user_id = u.id
        WHERE tp.id = ? AND tp.is_verified = TRUE`,
        [id]
      );

      if (!candidate) {
        throw new CustomError('Candidato não encontrado', 404);
      }

      // Verificar se há candidaturas para vagas da empresa
      let hasAppliedToCompany = false;
      try {
        const companyProfileId = await getOrCreateCompanyProfileId(userId);
        const application = await queryOne<any>(
          `SELECT COUNT(*) as count
           FROM applications a
           INNER JOIN jobs j ON a.job_id = j.id
           WHERE a.talent_profile_id = ? AND j.company_id = ?`,
          [id, companyProfileId]
        );
        hasAppliedToCompany = (application?.count || 0) > 0;
      } catch {
        // Se não conseguir obter company profile, considerar como false
      }

      // Normalizar dados
      const normalizedCandidate = {
        id: candidate.id,
        firstName: candidate.first_name,
        lastName: candidate.last_name,
        fullName: `${candidate.first_name} ${candidate.last_name}`,
        email: candidate.email,
        phone: candidate.phone,
        profilePictureUrl: candidate.profile_picture_url,
        dateOfBirth: candidate.date_of_birth,
        nationality: candidate.nationality,
        gender: candidate.gender,
        hasZolangolaBadge: Boolean(candidate.has_zolangola_badge),
        title: candidate.title,
        location: `${candidate.city || ''} ${candidate.province || ''}`.trim() || candidate.country || 'Angola',
        city: candidate.city,
        province: candidate.province,
        country: candidate.country,
        bio: candidate.bio,
        skills: candidate.skills ? candidate.skills.split(',') : [],
        education: candidate.education ? JSON.parse(candidate.education) : [],
        experience: candidate.experience ? JSON.parse(candidate.experience) : [],
        languages: candidate.languages ? JSON.parse(candidate.languages) : [],
        availabilityStatus: candidate.availability_status,
        availability: candidate.availability_status === 'available' ? 'disponivel' : candidate.availability_status === 'employed' ? 'empregado' : 'em_processo',
        isVerified: Boolean(candidate.is_verified),
        createdAt: candidate.created_at,
        updatedAt: candidate.updated_at,
        hasAppliedToCompany,
      };

      res.status(200).json(createSuccessResponse(normalizedCandidate));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /company/candidates/:id/contact
   * Enviar mensagem/convite para candidato
   */
  static async contactCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;
      const { message, jobId: _jobId } = req.body;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      if (!message || message.trim().length === 0) {
        throw new CustomError('Mensagem é obrigatória', 400);
      }

      // Verificar se o candidato existe
      const candidate = await queryOne<any>(
        `SELECT tp.id, u.email, tu.first_name, tu.last_name
         FROM talent_profiles tp
         INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
         INNER JOIN users u ON tu.user_id = u.id
         WHERE tp.id = ? AND tp.is_verified = TRUE`,
        [id]
      );

      if (!candidate) {
        throw new CustomError('Candidato não encontrado', 404);
      }

      // Buscar dados da empresa
      const companyUser = await queryOne<any>(
        `SELECT cu.id 
         FROM company_users cu 
         WHERE cu.user_id = ?`,
        [userId]
      );

      if (!companyUser) {
        throw new CustomError('Perfil de empresa não encontrado', 404);
      }

      // TODO: Implementar envio de email/notificação
      // Por enquanto, apenas registrar a ação
      // Em produção, aqui seria enviado um email ou notificação ao candidato
      // jobId e companyProfile serão usados quando implementarmos o envio de email

      res.status(200).json(
        createSuccessResponse(
          { sent: true },
          'Mensagem enviada com sucesso ao candidato'
        )
      );
    } catch (error) {
      next(error);
    }
  }
}

