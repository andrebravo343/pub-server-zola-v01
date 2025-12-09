import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne, execute } from '../../utils/database';

export class PublicJobsController {
  /**
   * GET /public/jobs
   * Listar vagas públicas disponíveis (sem autenticação)
   */
  static async listJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        search = '',
        location = '',
        jobType = '',
        city = '',
        page = 1,
        limit = 20,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      // Construir condições WHERE - apenas vagas ativas
      const whereConditions: string[] = ["j.status = 'active'"];
      const params: any[] = [];

      // Busca por texto (título, descrição)
      if (search) {
        whereConditions.push('(j.title LIKE ? OR j.description LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam);
      }

      // Filtro por localização (city, province, country)
      if (location) {
        whereConditions.push('(j.city LIKE ? OR j.province LIKE ? OR j.country LIKE ?)');
        const locationParam = `%${location}%`;
        params.push(locationParam, locationParam, locationParam);
      }

      // Filtro por cidade específica
      if (city) {
        whereConditions.push('j.city = ?');
        params.push(city);
      }

      // Filtro por tipo de vaga
      if (jobType) {
        whereConditions.push('j.job_type = ?');
        params.push(jobType);
      }

      // Ordenação por data de publicação (mais recentes primeiro)
      const orderBy = 'j.published_at DESC';

      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);
      
      // Query principal
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

      // Contar total
      const total = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM jobs j
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE ${whereConditions.join(' AND ')}`,
        params
      );

      // Normalizar dados para o formato esperado pelo site
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
        salaryCurrency: job.salary_currency || 'AOA',
        salaryPeriod: job.salary_period,
        publishedAt: job.published_at,
        viewsCount: job.views_count || 0,
        applicationsCount: job.applications_count || 0,
        companyName: job.company_name || 'Empresa não especificada',
        companyLogo: job.company_logo || null,
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
   * GET /public/jobs/:id
   * Obter detalhes de uma vaga pública (sem autenticação)
   */
  static async getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      // Buscar vaga
      const job = await queryOne<any>(
        `SELECT 
          j.*,
          cu.company_name,
          cp.logo_url as company_logo,
          cp.description as company_description,
          cp.website as company_website
        FROM jobs j
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE j.id = ? AND j.status = 'active'`,
        [id]
      );

      if (!job) {
        throw new CustomError('Vaga não encontrada', 404);
      }

      // Incrementar contador de visualizações
      await execute(
        `UPDATE jobs SET views_count = COALESCE(views_count, 0) + 1 WHERE id = ?`,
        [id]
      );

      // Parse requirements e benefits (JSON strings)
      let requirements: string[] = [];
      let benefits: string[] = [];
      
      try {
        if (job.requirements) {
          requirements = typeof job.requirements === 'string' 
            ? JSON.parse(job.requirements) 
            : job.requirements;
        }
      } catch (e) {
        // Se não for JSON válido, tratar como string simples
        requirements = job.requirements ? [job.requirements] : [];
      }

      try {
        if (job.benefits) {
          benefits = typeof job.benefits === 'string' 
            ? JSON.parse(job.benefits) 
            : job.benefits;
        }
      } catch (e) {
        // Se não for JSON válido, tratar como string simples
        benefits = job.benefits ? [job.benefits] : [];
      }

      // Normalizar dados para o formato esperado pelo site
      const normalizedJob = {
        id: job.id,
        title: job.title,
        description: job.description,
        requirements: Array.isArray(requirements) ? requirements : [],
        benefits: Array.isArray(benefits) ? benefits : [],
        jobType: job.job_type,
        locationType: job.location_type,
        city: job.city,
        province: job.province,
        country: job.country,
        experienceLevel: job.experience_level,
        salaryMin: job.salary_min ? Number(job.salary_min) : null,
        salaryMax: job.salary_max ? Number(job.salary_max) : null,
        salaryCurrency: job.salary_currency || 'AOA',
        salaryPeriod: job.salary_period,
        publishedAt: job.published_at,
        expiryDate: job.expiry_date,
        viewsCount: (job.views_count || 0) + 1,
        applicationsCount: job.applications_count || 0,
        isInternal: Boolean(job.is_internal),
        company: {
          id: job.company_id,
          name: job.company_name || 'Empresa não especificada',
          logo: job.company_logo,
          description: job.company_description,
          website: job.company_website,
        },
      };

      res.status(200).json(createSuccessResponse(normalizedJob));
    } catch (error) {
      next(error);
    }
  }
}

