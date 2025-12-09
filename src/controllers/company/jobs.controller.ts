import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne, execute } from '../../utils/database';
import { generateUUID } from '../../utils/uuid';
import { getOrCreateCompanyProfileId } from '../../utils/companyHelper';

export class CompanyJobsController {
  /**
   * GET /company/jobs
   * Listar vagas da empresa (com filtros e paginação)
   */
  static async listJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      const {
        search = '',
        status = 'all',
        jobType = 'all',
        locationType = 'all',
        page = 1,
        limit = 10,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 10);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      const whereConditions: string[] = ['j.company_id = ?'];
      const params: any[] = [companyProfileId];

      if (search) {
        whereConditions.push('(j.title LIKE ? OR j.description LIKE ? OR j.requirements LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }

      if (status !== 'all') {
        whereConditions.push('j.status = ?');
        params.push(status);
      }

      if (jobType !== 'all') {
        whereConditions.push('j.job_type = ?');
        params.push(jobType);
      }

      if (locationType !== 'all') {
        whereConditions.push('j.location_type = ?');
        params.push(locationType);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM jobs j ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      // Buscar vagas
      const jobs = await query<any>(
        `SELECT 
          j.id,
          j.title,
          j.description,
          j.requirements,
          j.benefits,
          j.location_type,
          j.city,
          j.province,
          j.country,
          j.job_type,
          j.job_category,
          j.experience_level,
          j.salary_min,
          j.salary_max,
          j.salary_currency,
          j.salary_period,
          j.is_premium,
          j.status,
          j.published_at,
          j.closed_at,
          j.applications_count,
          j.views_count,
          j.created_at,
          j.updated_at,
          cu.company_name
        FROM jobs j
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        ${whereClause}
        ORDER BY j.created_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Normalizar dados
      const normalizedJobs = jobs.map((job: any) => ({
        id: job.id,
        title: job.title,
        description: job.description,
        requirements: job.requirements,
        benefits: job.benefits,
        locationType: job.location_type,
        city: job.city,
        province: job.province,
        country: job.country,
        jobType: job.job_type,
        jobCategory: job.job_category,
        experienceLevel: job.experience_level,
        salaryMin: job.salary_min ? Number(job.salary_min) : null,
        salaryMax: job.salary_max ? Number(job.salary_max) : null,
        salaryCurrency: job.salary_currency,
        salaryPeriod: job.salary_period,
        isPremium: Boolean(job.is_premium),
        status: job.status,
        publishedAt: job.published_at,
        closedAt: job.closed_at,
        applicationsCount: job.applications_count || 0,
        viewsCount: job.views_count || 0,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        companyName: job.company_name,
      }));

      res.status(200).json(
        createSuccessResponse({
          jobs: normalizedJobs,
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
   * GET /company/jobs/:id
   * Obter detalhes de uma vaga
   */
  static async getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se a vaga pertence à empresa do usuário
      const job = await queryOne<any>(
        `SELECT 
          j.*,
          cu.company_name,
          (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as applications_count_real
        FROM jobs j
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE j.id = ? AND cu.user_id = ?`,
        [id, userId]
      );

      if (!job) {
        throw new CustomError('Vaga não encontrada ou acesso negado', 404);
      }

      // Normalizar dados
      const normalizedJob = {
        id: job.id,
        title: job.title,
        description: job.description,
        requirements: job.requirements,
        benefits: job.benefits,
        locationType: job.location_type,
        city: job.city,
        province: job.province,
        country: job.country,
        jobType: job.job_type,
        jobCategory: job.job_category,
        experienceLevel: job.experience_level,
        salaryMin: job.salary_min ? Number(job.salary_min) : null,
        salaryMax: job.salary_max ? Number(job.salary_max) : null,
        salaryCurrency: job.salary_currency,
        salaryPeriod: job.salary_period,
        isPremium: Boolean(job.is_premium),
        status: job.status,
        publishedAt: job.published_at,
        closedAt: job.closed_at,
        applicationsCount: job.applications_count_real || job.applications_count || 0,
        viewsCount: job.views_count || 0,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        companyName: job.company_name,
      };

      res.status(200).json(createSuccessResponse(normalizedJob));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /company/jobs
   * Criar nova vaga
   */
  static async createJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      // Verificar se a empresa está aprovada
      const companyUser = await queryOne<any>(
        `SELECT cu.id, cu.approval_status 
         FROM company_users cu 
         WHERE cu.user_id = ?`,
        [userId]
      );

      if (companyUser?.approval_status !== 'approved') {
        throw new CustomError('Empresa não aprovada. Aguarde a aprovação para publicar vagas', 403);
      }

      const {
        title,
        description,
        requirements,
        benefits,
        locationType,
        city,
        province,
        country = 'Angola',
        jobType,
        jobCategory,
        experienceLevel,
        salaryMin,
        salaryMax,
        salaryCurrency = 'AOA',
        salaryPeriod,
        isPremium = false,
        status = 'draft',
      } = req.body;

      // Validações
      if (!title || !description || !requirements) {
        throw new CustomError('Título, descrição e requisitos são obrigatórios', 400);
      }

      if (!locationType || !['onsite', 'remote', 'hybrid'].includes(locationType)) {
        throw new CustomError('Tipo de localização inválido', 400);
      }

      if (!jobType || !['full_time', 'part_time', 'temporary', 'contract', 'internship'].includes(jobType)) {
        throw new CustomError('Tipo de trabalho inválido', 400);
      }

      if (status && !['draft', 'active', 'paused', 'closed', 'filled'].includes(status)) {
        throw new CustomError('Status inválido', 400);
      }

      const jobId = generateUUID();
      const publishedAt = status === 'active' ? new Date() : null;

      await execute(
        `INSERT INTO jobs (
          id, company_id, title, description, requirements, benefits,
          location_type, city, province, country, job_type, job_category,
          experience_level, salary_min, salary_max, salary_currency, salary_period,
          is_premium, status, published_at, applications_count, views_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        [
          jobId,
          companyProfileId,
          title,
          description,
          requirements,
          benefits || null,
          locationType,
          city || null,
          province || null,
          country,
          jobType,
          jobCategory || null,
          experienceLevel || null,
          salaryMin || null,
          salaryMax || null,
          salaryCurrency,
          salaryPeriod || null,
          isPremium ? 1 : 0,
          status,
          publishedAt,
        ]
      );

      // Buscar vaga criada
      const newJob = await queryOne<any>(
        `SELECT 
          j.*,
          cu.company_name
        FROM jobs j
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE j.id = ?`,
        [jobId]
      );

      const normalizedJob = {
        id: newJob.id,
        title: newJob.title,
        description: newJob.description,
        requirements: newJob.requirements,
        benefits: newJob.benefits,
        locationType: newJob.location_type,
        city: newJob.city,
        province: newJob.province,
        country: newJob.country,
        jobType: newJob.job_type,
        jobCategory: newJob.job_category,
        experienceLevel: newJob.experience_level,
        salaryMin: newJob.salary_min ? Number(newJob.salary_min) : null,
        salaryMax: newJob.salary_max ? Number(newJob.salary_max) : null,
        salaryCurrency: newJob.salary_currency,
        salaryPeriod: newJob.salary_period,
        isPremium: Boolean(newJob.is_premium),
        status: newJob.status,
        publishedAt: newJob.published_at,
        applicationsCount: newJob.applications_count || 0,
        viewsCount: newJob.views_count || 0,
        createdAt: newJob.created_at,
        updatedAt: newJob.updated_at,
        companyName: newJob.company_name,
      };

      res.status(201).json(createSuccessResponse(normalizedJob, 'Vaga criada com sucesso'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /company/jobs/:id
   * Atualizar vaga
   */
  static async updateJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se a vaga pertence à empresa
      const existingJob = await queryOne<any>(
        `SELECT j.*
         FROM jobs j
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE j.id = ? AND cu.user_id = ?`,
        [id, userId]
      );

      if (!existingJob) {
        throw new CustomError('Vaga não encontrada ou acesso negado', 404);
      }

      const {
        title,
        description,
        requirements,
        benefits,
        locationType,
        city,
        province,
        country,
        jobType,
        jobCategory,
        experienceLevel,
        salaryMin,
        salaryMax,
        salaryCurrency,
        salaryPeriod,
        isPremium,
        status,
      } = req.body;

      // Validações
      if (locationType && !['onsite', 'remote', 'hybrid'].includes(locationType)) {
        throw new CustomError('Tipo de localização inválido', 400);
      }

      if (jobType && !['full_time', 'part_time', 'temporary', 'contract', 'internship'].includes(jobType)) {
        throw new CustomError('Tipo de trabalho inválido', 400);
      }

      if (status && !['draft', 'active', 'paused', 'closed', 'filled'].includes(status)) {
        throw new CustomError('Status inválido', 400);
      }

      // Construir query de atualização
      const updates: string[] = [];
      const values: any[] = [];

      if (title !== undefined) {
        updates.push('title = ?');
        values.push(title);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
      }
      if (requirements !== undefined) {
        updates.push('requirements = ?');
        values.push(requirements);
      }
      if (benefits !== undefined) {
        updates.push('benefits = ?');
        values.push(benefits);
      }
      if (locationType !== undefined) {
        updates.push('location_type = ?');
        values.push(locationType);
      }
      if (city !== undefined) {
        updates.push('city = ?');
        values.push(city);
      }
      if (province !== undefined) {
        updates.push('province = ?');
        values.push(province);
      }
      if (country !== undefined) {
        updates.push('country = ?');
        values.push(country);
      }
      if (jobType !== undefined) {
        updates.push('job_type = ?');
        values.push(jobType);
      }
      if (jobCategory !== undefined) {
        updates.push('job_category = ?');
        values.push(jobCategory);
      }
      if (experienceLevel !== undefined) {
        updates.push('experience_level = ?');
        values.push(experienceLevel);
      }
      if (salaryMin !== undefined) {
        updates.push('salary_min = ?');
        values.push(salaryMin);
      }
      if (salaryMax !== undefined) {
        updates.push('salary_max = ?');
        values.push(salaryMax);
      }
      if (salaryCurrency !== undefined) {
        updates.push('salary_currency = ?');
        values.push(salaryCurrency);
      }
      if (salaryPeriod !== undefined) {
        updates.push('salary_period = ?');
        values.push(salaryPeriod);
      }
      if (isPremium !== undefined) {
        updates.push('is_premium = ?');
        values.push(isPremium ? 1 : 0);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);

        // Se mudando para active e ainda não foi publicado, definir published_at
        if (status === 'active' && !existingJob.published_at) {
          updates.push('published_at = NOW()');
        }

        // Se mudando para closed, definir closed_at
        if (status === 'closed' && !existingJob.closed_at) {
          updates.push('closed_at = NOW()');
        }
      }

      if (updates.length === 0) {
        throw new CustomError('Nenhum campo para atualizar', 400);
      }

      values.push(id);

      await execute(
        `UPDATE jobs SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
        values
      );

      // Buscar vaga atualizada
      const updatedJob = await queryOne<any>(
        `SELECT 
          j.*,
          cu.company_name
        FROM jobs j
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE j.id = ?`,
        [id]
      );

      const normalizedJob = {
        id: updatedJob.id,
        title: updatedJob.title,
        description: updatedJob.description,
        requirements: updatedJob.requirements,
        benefits: updatedJob.benefits,
        locationType: updatedJob.location_type,
        city: updatedJob.city,
        province: updatedJob.province,
        country: updatedJob.country,
        jobType: updatedJob.job_type,
        jobCategory: updatedJob.job_category,
        experienceLevel: updatedJob.experience_level,
        salaryMin: updatedJob.salary_min ? Number(updatedJob.salary_min) : null,
        salaryMax: updatedJob.salary_max ? Number(updatedJob.salary_max) : null,
        salaryCurrency: updatedJob.salary_currency,
        salaryPeriod: updatedJob.salary_period,
        isPremium: Boolean(updatedJob.is_premium),
        status: updatedJob.status,
        publishedAt: updatedJob.published_at,
        closedAt: updatedJob.closed_at,
        applicationsCount: updatedJob.applications_count || 0,
        viewsCount: updatedJob.views_count || 0,
        createdAt: updatedJob.created_at,
        updatedAt: updatedJob.updated_at,
        companyName: updatedJob.company_name,
      };

      res.status(200).json(createSuccessResponse(normalizedJob, 'Vaga atualizada com sucesso'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /company/jobs/:id
   * Deletar vaga
   */
  static async deleteJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se a vaga pertence à empresa
      const job = await queryOne<any>(
        `SELECT j.id
         FROM jobs j
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE j.id = ? AND cu.user_id = ?`,
        [id, userId]
      );

      if (!job) {
        throw new CustomError('Vaga não encontrada ou acesso negado', 404);
      }

      await execute(`DELETE FROM jobs WHERE id = ?`, [id]);

      res.status(200).json(createSuccessResponse(null, 'Vaga deletada com sucesso'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /company/jobs/:id/status
   * Atualizar apenas o status da vaga
   */
  static async updateJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;
      const { status } = req.body;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      if (!status || !['draft', 'active', 'paused', 'closed', 'filled'].includes(status)) {
        throw new CustomError('Status inválido', 400);
      }

      // Verificar se a vaga pertence à empresa
      const existingJob = await queryOne<any>(
        `SELECT j.*
         FROM jobs j
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE j.id = ? AND cu.user_id = ?`,
        [id, userId]
      );

      if (!existingJob) {
        throw new CustomError('Vaga não encontrada ou acesso negado', 404);
      }

      const updates: string[] = ['status = ?'];
      const values: any[] = [status];

      // Se mudando para active e ainda não foi publicado, definir published_at
      if (status === 'active' && !existingJob.published_at) {
        updates.push('published_at = NOW()');
      }

      // Se mudando para closed, definir closed_at
      if (status === 'closed' && !existingJob.closed_at) {
        updates.push('closed_at = NOW()');
      }

      values.push(id);

      await execute(
        `UPDATE jobs SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
        values
      );

      res.status(200).json(createSuccessResponse({ status }, 'Status da vaga atualizado com sucesso'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /company/jobs/:id/stats
   * Obter estatísticas de uma vaga
   */
  static async getJobStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se a vaga pertence à empresa
      const job = await queryOne<any>(
        `SELECT j.id
         FROM jobs j
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE j.id = ? AND cu.user_id = ?`,
        [id, userId]
      );

      if (!job) {
        throw new CustomError('Vaga não encontrada ou acesso negado', 404);
      }

      // Estatísticas de candidaturas por status
      const applicationsByStatus = await query<any>(
        `SELECT 
          status,
          COUNT(*) as count
        FROM applications
        WHERE job_id = ?
        GROUP BY status`,
        [id]
      );

      // Total de candidaturas
      const totalApplications = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM applications WHERE job_id = ?`,
        [id]
      );

      // Candidaturas recentes (últimos 7 dias)
      const recentApplications = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM applications 
         WHERE job_id = ? AND applied_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [id]
      );

      res.status(200).json(
        createSuccessResponse({
          viewsCount: job.views_count || 0,
          totalApplications: totalApplications?.total || 0,
          recentApplications: recentApplications?.count || 0,
          applicationsByStatus: applicationsByStatus.reduce((acc: any, item: any) => {
            acc[item.status] = item.count;
            return acc;
          }, {}),
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

