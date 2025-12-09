import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne, execute } from '../../utils/database';
import { generateUUID } from '../../utils/uuid';

export class TalentJobsController {
  /**
   * GET /talent/jobs
   * Listar vagas disponíveis com filtros
   */
  static async listJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter talent_profile_id para verificar vagas salvas
      // Usar helper para garantir que o perfil existe
      const { getOrCreateTalentProfileId } = await import('../../utils/talentHelper');
      let talentProfileId: string | null = null;
      try {
        const result = await getOrCreateTalentProfileId(userId);
        talentProfileId = result.talentProfileId;
      } catch (error) {
        // Se não conseguir criar, continuar sem talentProfileId
        console.log('Não foi possível obter talent_profile_id:', error);
      }

      const {
        search = '',
        location = '',
        jobType = '',
        experienceLevel = '',
        salaryMin = '',
        salaryMax = '',
        page = 1,
        limit = 20,
        sort = 'date', // 'date', 'relevance', 'salary'
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      // Construir condições WHERE
      const whereConditions: string[] = ["j.status = 'active'"];
      const params: any[] = [];

      // Busca por texto (título, descrição)
      if (search) {
        whereConditions.push('(j.title LIKE ? OR j.description LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam);
      }

      // Filtro por localização
      if (location) {
        whereConditions.push('(j.city LIKE ? OR j.province LIKE ? OR j.country LIKE ?)');
        const locationParam = `%${location}%`;
        params.push(locationParam, locationParam, locationParam);
      }

      // Filtro por tipo de vaga
      if (jobType) {
        whereConditions.push('j.job_type = ?');
        params.push(jobType);
      }

      // Filtro por nível de experiência
      if (experienceLevel) {
        whereConditions.push('j.experience_level = ?');
        params.push(experienceLevel);
      }

      // Filtro por salário mínimo
      if (salaryMin) {
        whereConditions.push('(j.salary_min >= ? OR j.salary_max >= ?)');
        params.push(Number(salaryMin), Number(salaryMin));
      }

      // Filtro por salário máximo
      if (salaryMax) {
        whereConditions.push('(j.salary_min <= ? OR j.salary_max <= ?)');
        params.push(Number(salaryMax), Number(salaryMax));
      }

      // Ordenação
      let orderBy = 'j.published_at DESC';
      if (sort === 'salary') {
        orderBy = 'j.salary_max DESC, j.salary_min DESC';
      } else if (sort === 'relevance') {
        // Ordenar por views e aplicações (mais popular)
        orderBy = 'j.views_count DESC, j.applications_count DESC';
      }

      // Query principal - buscar vagas sem is_saved e has_applied primeiro
      // Depois verificamos esses campos em queries separadas para evitar problemas com placeholders
      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);
      
      const jobs = await query<any>(
        `SELECT 
          j.id,
          j.title,
          j.description,
          j.job_type,
          j.location_type,
          j.city,
          j.province,
          j.country,
          j.experience_level,
          j.salary_min,
          j.salary_max,
          j.salary_currency,
          j.salary_period,
          j.published_at,
          j.views_count,
          j.applications_count,
          j.is_internal,
          cu.company_name,
          cp.logo_url as company_logo
        FROM jobs j
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Se temos talentProfileId, buscar is_saved e has_applied em queries separadas
      if (talentProfileId && jobs.length > 0) {
        const jobIds = jobs.map((j: any) => j.id);
        const placeholders = jobIds.map(() => '?').join(',');
        
        // Buscar vagas salvas
        const savedJobs = await query<any>(
          `SELECT job_id FROM saved_jobs 
           WHERE talent_profile_id = ? AND job_id IN (${placeholders})`,
          [talentProfileId, ...jobIds]
        );
        const savedJobIds = new Set(savedJobs.map((sj: any) => sj.job_id));
        
        // Buscar candidaturas
        const applications = await query<any>(
          `SELECT job_id FROM applications 
           WHERE talent_profile_id = ? AND job_id IN (${placeholders})`,
          [talentProfileId, ...jobIds]
        );
        const appliedJobIds = new Set(applications.map((a: any) => a.job_id));
        
        // Adicionar is_saved e has_applied aos resultados
        jobs.forEach((job: any) => {
          job.is_saved = savedJobIds.has(job.id);
          job.has_applied = appliedJobIds.has(job.id);
        });
      } else {
        // Se não temos talentProfileId, definir como false
        jobs.forEach((job: any) => {
          job.is_saved = false;
          job.has_applied = false;
        });
      }

      // Contar total
      const total = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM jobs j
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE ${whereConditions.join(' AND ')}`,
        params
      );

      // Normalizar dados
      const normalizedJobs = jobs.map((job: any) => ({
        id: job.id,
        title: job.title,
        description: job.description,
        jobType: job.job_type,
        locationType: job.location_type,
        city: job.city,
        province: job.province,
        country: job.country,
        experienceLevel: job.experience_level,
        salaryMin: job.salary_min ? Number(job.salary_min) : null,
        salaryMax: job.salary_max ? Number(job.salary_max) : null,
        salaryCurrency: job.salary_currency,
        salaryPeriod: job.salary_period,
        publishedAt: job.published_at,
        viewsCount: job.views_count || 0,
        applicationsCount: job.applications_count || 0,
        companyName: job.company_name || 'Empresa não especificada',
        companyLogo: job.company_logo || null,
        isSaved: Boolean(job.is_saved),
        hasApplied: Boolean(job.has_applied),
        isInternal: Boolean(job.is_internal),
      }));

      res.status(200).json(
        createSuccessResponse({
          jobs: normalizedJobs,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: total?.count || 0,
            totalPages: Math.ceil((total?.count || 0) / limitNum),
          },
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /talent/jobs/:id
   * Obter detalhes de uma vaga específica
   */
  static async getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter talent_profile_id
      const talentUser = await queryOne<any>(
        `SELECT id FROM talent_users WHERE user_id = ?`,
        [userId]
      );

      const talentProfile = talentUser
        ? await queryOne<any>(
            `SELECT id FROM talent_profiles WHERE talent_user_id = ?`,
            [talentUser.id]
          )
        : null;

      const talentProfileId = talentProfile?.id;

      // Buscar vaga
      const job = await queryOne<any>(
        `SELECT 
          j.*,
          cu.company_name,
          cp.logo_url as company_logo,
          cp.description as company_description,
          cp.website as company_website,
          ${talentProfileId ? `EXISTS(SELECT 1 FROM saved_jobs sj WHERE sj.job_id = j.id AND sj.talent_profile_id = ?) as is_saved,` : 'FALSE as is_saved,'}
          ${talentProfileId ? `EXISTS(SELECT 1 FROM applications a WHERE a.job_id = j.id AND a.talent_profile_id = ?) as has_applied,` : 'FALSE as has_applied,'}
          ${talentProfileId ? `(SELECT status FROM applications a WHERE a.job_id = j.id AND a.talent_profile_id = ? LIMIT 1) as application_status` : 'NULL as application_status'}
        FROM jobs j
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE j.id = ? AND j.status = 'active'`,
        talentProfileId 
          ? [talentProfileId, talentProfileId, talentProfileId, id]
          : [id]
      );

      if (!job) {
        throw new CustomError('Vaga não encontrada', 404);
      }

      // Incrementar contador de visualizações
      await execute(
        `UPDATE jobs SET views_count = COALESCE(views_count, 0) + 1 WHERE id = ?`,
        [id]
      );

      // Normalizar dados
      const normalizedJob = {
        id: job.id,
        title: job.title,
        description: job.description,
        requirements: job.requirements,
        benefits: job.benefits,
        jobType: job.job_type,
        locationType: job.location_type,
        city: job.city,
        province: job.province,
        country: job.country,
        experienceLevel: job.experience_level,
        salaryMin: job.salary_min ? Number(job.salary_min) : null,
        salaryMax: job.salary_max ? Number(job.salary_max) : null,
        salaryCurrency: job.salary_currency,
        salaryPeriod: job.salary_period,
        publishedAt: job.published_at,
        viewsCount: (job.views_count || 0) + 1,
        applicationsCount: job.applications_count || 0,
        company: {
          id: job.company_id,
          name: job.company_name,
          logo: job.company_logo,
          description: job.company_description,
          website: job.company_website,
        },
        isSaved: Boolean(job.is_saved),
        hasApplied: Boolean(job.has_applied),
        applicationStatus: job.application_status || null,
        isInternal: Boolean(job.is_internal),
      };

      res.status(200).json(createSuccessResponse(normalizedJob));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /talent/jobs/:id/save
   * Salvar/favoritar vaga
   */
  static async saveJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se tabela saved_jobs existe
      try {
        // Obter talent_profile_id
        const talentUser = await queryOne<any>(
          `SELECT id FROM talent_users WHERE user_id = ?`,
          [userId]
        );

        if (!talentUser) {
          throw new CustomError('Perfil de talento não encontrado', 404);
        }

        const talentProfile = await queryOne<any>(
          `SELECT id FROM talent_profiles WHERE talent_user_id = ?`,
          [talentUser.id]
        );

        if (!talentProfile) {
          throw new CustomError('Perfil de talento não encontrado', 404);
        }

        // Verificar se vaga existe
        const job = await queryOne<any>(
          `SELECT id FROM jobs WHERE id = ? AND status = 'active'`,
          [id]
        );

        if (!job) {
          throw new CustomError('Vaga não encontrada', 404);
        }

        // Verificar se já está salva
        const existing = await queryOne<any>(
          `SELECT id FROM saved_jobs WHERE job_id = ? AND talent_profile_id = ?`,
          [id, talentProfile.id]
        );

        if (existing) {
          res.status(200).json(createSuccessResponse({ message: 'Vaga já está salva' }));
          return;
        }

        // Salvar vaga
        const savedJobId = generateUUID();
        await execute(
          `INSERT INTO saved_jobs (id, job_id, talent_profile_id, created_at)
           VALUES (?, ?, ?, NOW())`,
          [savedJobId, id, talentProfile.id]
        );

        res.status(201).json(createSuccessResponse({ message: 'Vaga salva com sucesso' }));
      } catch (error: any) {
        if (error.message?.includes("doesn't exist") || error.message?.includes("Unknown table")) {
          throw new CustomError('Funcionalidade de salvar vagas ainda não está disponível', 501);
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /talent/jobs/:id/save
   * Remover vaga salva
   */
  static async unsaveJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter talent_profile_id
      const talentUser = await queryOne<any>(
        `SELECT id FROM talent_users WHERE user_id = ?`,
        [userId]
      );

      if (!talentUser) {
        throw new CustomError('Perfil de talento não encontrado', 404);
      }

      const talentProfile = await queryOne<any>(
        `SELECT id FROM talent_profiles WHERE talent_user_id = ?`,
        [talentUser.id]
      );

      if (!talentProfile) {
        throw new CustomError('Perfil de talento não encontrado', 404);
      }

      // Remover vaga salva
      await execute(
        `DELETE FROM saved_jobs WHERE job_id = ? AND talent_profile_id = ?`,
        [id, talentProfile.id]
      );

      res.status(200).json(createSuccessResponse({ message: 'Vaga removida dos salvos' }));
    } catch (error: any) {
      if (error.message?.includes("doesn't exist") || error.message?.includes("Unknown table")) {
        throw new CustomError('Funcionalidade de salvar vagas ainda não está disponível', 501);
      }
      next(error);
    }
  }
}

