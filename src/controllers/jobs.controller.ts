import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../middlewares/errorHandler';
import { createSuccessResponse } from '../utils/response';
import { query, queryOne, execute } from '../utils/database';
import { generateUUID } from '../utils/uuid';

export class JobsController {
  /**
   * GET /admin/jobs/internal
   * Listar vagas internas
   */
  static async listInternalJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        search = '',
        status = 'all',
        page = 1,
        limit = 10,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 10);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      const whereConditions: string[] = ["j.is_internal = TRUE"];
      const params: any[] = [];

      if (search) {
        whereConditions.push('(j.title LIKE ? OR j.description LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam);
      }

      if (status !== 'all') {
        whereConditions.push('j.status = ?');
        params.push(status);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM jobs j ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;
      
      // LIMIT e OFFSET não funcionam com placeholders no MySQL2, usar valores literais
      // Garantir que são números inteiros para prevenir SQL injection
      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);
      
      // Buscar vagas - Para vagas internas, sempre usar 'AMANGOLA' como company_name
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
          j.status,
          j.published_at,
          j.applications_count,
          j.views_count,
          j.created_at,
          j.updated_at,
          'AMANGOLA' as company_name
        FROM jobs j
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
        salaryMin: job.salary_min,
        salaryMax: job.salary_max,
        salaryCurrency: job.salary_currency,
        salaryPeriod: job.salary_period,
        status: job.status,
        publishedAt: job.published_at,
        applicationsCount: job.applications_count,
        viewsCount: job.views_count,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        companyName: job.company_name || 'AMANGOLA',
      }));

      res.status(200).json(
        createSuccessResponse({
          jobs: normalizedJobs,
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
   * POST /admin/jobs/internal
   * Criar vaga interna
   */
  static async createInternalJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
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
        status = 'draft',
      } = req.body;

      // Validações completas
      if (!title || !description || !requirements) {
        throw new CustomError('Título, descrição e requisitos são obrigatórios', 400);
      }

      if (!locationType || !['onsite', 'remote', 'hybrid'].includes(locationType)) {
        throw new CustomError('Tipo de localização inválido. Deve ser: onsite, remote ou hybrid', 400);
      }

      if (!jobType || !['full_time', 'part_time', 'temporary', 'contract', 'internship'].includes(jobType)) {
        throw new CustomError('Tipo de trabalho inválido', 400);
      }

      if (status && !['draft', 'active', 'paused', 'closed', 'filled'].includes(status)) {
        throw new CustomError('Status inválido', 400);
      }

      // Buscar ou criar company_profile para AMANGOLA
      // Primeiro verificar se existe company_user para AMANGOLA
      let amangolaCompanyUser = await queryOne<any>(
        `SELECT id FROM company_users WHERE company_name = 'AMANGOLA' LIMIT 1`
      );

      let amangolaCompanyProfile = null;

      if (amangolaCompanyUser) {
        // Se existe company_user, buscar o profile
        amangolaCompanyProfile = await queryOne<any>(
          `SELECT id FROM company_profiles WHERE company_user_id = ? LIMIT 1`,
          [amangolaCompanyUser.id]
        );
      }

      if (!amangolaCompanyProfile) {
        // Criar company_user e company_profile para AMANGOLA se não existir
        // Primeiro criar um user base (se necessário)
        const amangolaUserId = generateUUID();
        const amangolaUserEmail = 'amangola@internal.local';
        
        // Verificar se já existe user
        const existingUser = await queryOne<any>(
          `SELECT id FROM users WHERE email = ?`,
          [amangolaUserEmail]
        );

        let userIdToUse = existingUser?.id;
        
        if (!userIdToUse) {
          // Criar user base (sem senha, apenas para referência)
          await execute(
            `INSERT INTO users (id, email, password_hash, user_type, is_active)
             VALUES (?, ?, ?, 'company', TRUE)`,
            [amangolaUserId, amangolaUserEmail, 'internal_no_password']
          );
          userIdToUse = amangolaUserId;
        }

        // Criar company_user
        const companyUserId = generateUUID();
        await execute(
          `INSERT INTO company_users (id, user_id, company_name, nif, approval_status)
           VALUES (?, ?, 'AMANGOLA', 'INTERNAL-000', 'approved')`,
          [companyUserId, userIdToUse]
        );

        // Criar company_profile
        const companyProfileId = generateUUID();
        await execute(
          `INSERT INTO company_profiles (id, company_user_id, description, country)
           VALUES (?, ?, 'Empresa interna AMANGOLA', 'Angola')`,
          [companyProfileId, companyUserId]
        );
        
        amangolaCompanyProfile = { id: companyProfileId };
      }

      const jobId = generateUUID();
      const now = new Date();

      // Validar campos obrigatórios
      if (!locationType || !jobType) {
        throw new CustomError('Tipo de localização e tipo de trabalho são obrigatórios', 400);
      }

      // Validar valores de ENUM
      const validLocationTypes = ['onsite', 'remote', 'hybrid'];
      const validJobTypes = ['full_time', 'part_time', 'temporary', 'contract', 'internship'];
      const validStatuses = ['draft', 'active', 'paused', 'closed', 'filled'];
      const validExperienceLevels = ['entry', 'mid', 'senior', 'executive'];
      const validSalaryPeriods = ['hourly', 'daily', 'monthly', 'yearly'];

      if (!validLocationTypes.includes(locationType)) {
        throw new CustomError(`Tipo de localização inválido. Deve ser um de: ${validLocationTypes.join(', ')}`, 400);
      }

      if (!validJobTypes.includes(jobType)) {
        throw new CustomError(`Tipo de trabalho inválido. Deve ser um de: ${validJobTypes.join(', ')}`, 400);
      }

      if (status && !validStatuses.includes(status)) {
        throw new CustomError(`Status inválido. Deve ser um de: ${validStatuses.join(', ')}`, 400);
      }

      if (experienceLevel && !validExperienceLevels.includes(experienceLevel)) {
        throw new CustomError(`Nível de experiência inválido. Deve ser um de: ${validExperienceLevels.join(', ')}`, 400);
      }

      if (salaryPeriod && !validSalaryPeriods.includes(salaryPeriod)) {
        throw new CustomError(`Período salarial inválido. Deve ser um de: ${validSalaryPeriods.join(', ')}`, 400);
      }

      // Garantir que valores numéricos sejam números ou null
      const safeSalaryMin = salaryMin ? Number(salaryMin) : null;
      const safeSalaryMax = salaryMax ? Number(salaryMax) : null;

      // Preparar valores para INSERT
      const insertValues = [
        jobId,                    // 1
        amangolaCompanyProfile.id, // 2
        String(title).trim(),     // 3
        String(description).trim(), // 4
        String(requirements).trim(), // 5
        benefits ? String(benefits).trim() : null, // 6
        locationType,             // 7
        city ? String(city).trim() : null, // 8
        province ? String(province).trim() : null, // 9
        String(country).trim(),   // 10
        jobType,                  // 11
        jobCategory ? String(jobCategory).trim() : null, // 12
        experienceLevel || null,  // 13
        safeSalaryMin,            // 14
        safeSalaryMax,            // 15
        String(salaryCurrency).trim(), // 16
        salaryPeriod || null,     // 17
        // is_internal = TRUE (literal, não precisa placeholder)
        status,                   // 18
        status === 'active' ? now : null, // 19
        now,                      // 20
        now,                      // 21
      ];

      // Verificar se temos exatamente 21 valores
      if (insertValues.length !== 21) {
        throw new CustomError(`Erro interno: número incorreto de valores (${insertValues.length} em vez de 21)`, 500);
      }

      await execute(
        `INSERT INTO jobs (
          id, company_id, title, description, requirements, benefits,
          location_type, city, province, country, job_type, job_category,
          experience_level, salary_min, salary_max, salary_currency, salary_period,
          is_internal, status, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?)`,
        insertValues
      );

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'create_internal_job', 'job', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          jobId,
          JSON.stringify({ title, status }),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(201).json(createSuccessResponse({ id: jobId, message: 'Vaga interna criada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/jobs/internal/:id
   * Atualizar vaga interna
   */
  static async updateInternalJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      const updates = req.body;

      // Verificar se a vaga existe e é interna
      const job = await queryOne<any>(
        `SELECT id, status FROM jobs WHERE id = ? AND is_internal = TRUE`,
        [id]
      );

      if (!job) {
        throw new CustomError('Vaga interna não encontrada', 404);
      }

      const updateFields: string[] = [];
      const values: any[] = [];

      const allowedFields = [
        'title', 'description', 'requirements', 'benefits',
        'location_type', 'city', 'province', 'country',
        'job_type', 'job_category', 'experience_level',
        'salary_min', 'salary_max', 'salary_currency', 'salary_period',
        'status',
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateFields.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      if (updateFields.length === 0) {
        throw new CustomError('Nenhum campo para atualizar', 400);
      }

      // Se status mudou para 'active', definir published_at
      if (updates.status === 'active' && job.status !== 'active') {
        updateFields.push('published_at = ?');
        values.push(new Date());
      }

      updateFields.push('updated_at = ?');
      values.push(new Date());
      values.push(id);

      await execute(
        `UPDATE jobs SET ${updateFields.join(', ')} WHERE id = ?`,
        values
      );

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'update_internal_job', 'job', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          id,
          JSON.stringify(updates),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(200).json(createSuccessResponse({ message: 'Vaga interna atualizada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/jobs/internal/:id
   * Deletar vaga interna
   */
  static async deleteInternalJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      // Verificar se a vaga existe e é interna
      const job = await queryOne<any>(
        `SELECT id FROM jobs WHERE id = ? AND is_internal = TRUE`,
        [id]
      );

      if (!job) {
        throw new CustomError('Vaga interna não encontrada', 404);
      }

      await execute(`DELETE FROM jobs WHERE id = ?`, [id]);

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'delete_internal_job', 'job', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          id,
          JSON.stringify({ deleted: true }),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(200).json(createSuccessResponse({ message: 'Vaga interna deletada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }
}

