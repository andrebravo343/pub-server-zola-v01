import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne, execute } from '../../utils/database';
import { generateUUID } from '../../utils/uuid';
import { getOrCreateTalentProfileId } from '../../utils/talentHelper';

export class TalentApplicationsController {
  /**
   * GET /talent/applications
   * Listar candidaturas do talento
   */
  static async listApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar talent_profile_id
      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      const {
        status = '',
        jobId = '',
        page = 1,
        limit = 20,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const offset = Math.max(0, (pageNum - 1) * limitNum);
      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      // Construir condições WHERE
      const whereConditions: string[] = ['a.talent_profile_id = ?'];
      const params: any[] = [talentProfileId];

      if (status) {
        whereConditions.push('a.status = ?');
        params.push(status);
      }

      if (jobId) {
        whereConditions.push('a.job_id = ?');
        params.push(jobId);
      }

      // Buscar candidaturas
      const applications = await query<any>(
        `SELECT 
          a.id,
          a.status,
          a.applied_at,
          a.cover_letter as notes,
          j.id as job_id,
          j.title as job_title,
          j.job_type,
          j.city,
          j.province,
          j.country,
          j.salary_min,
          j.salary_max,
          j.salary_currency,
          cu.company_name,
          cp.logo_url as company_logo
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY a.applied_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Contar total
      const total = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications a
         WHERE ${whereConditions.join(' AND ')}`,
        params
      );

      // Normalizar dados
      const normalizedApplications = applications.map((app: any) => ({
        id: app.id,
        status: app.status,
        appliedAt: app.applied_at,
        notes: app.notes,
        job: {
          id: app.job_id,
          title: app.job_title,
          jobType: app.job_type,
          location: {
            city: app.city,
            province: app.province,
            country: app.country,
          },
          salary: {
            min: app.salary_min ? Number(app.salary_min) : null,
            max: app.salary_max ? Number(app.salary_max) : null,
            currency: app.salary_currency,
          },
        },
        company: {
          name: app.company_name,
          logo: app.company_logo,
        },
      }));

      res.status(200).json(
        createSuccessResponse({
          applications: normalizedApplications,
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
   * GET /talent/applications/:id
   * Obter detalhes de uma candidatura
   */
  static async getApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar talent_profile_id
      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      // Buscar candidatura
      const application = await queryOne<any>(
        `SELECT 
          a.*,
          j.id as job_id,
          j.title as job_title,
          j.description as job_description,
          j.job_type,
          j.city,
          j.province,
          j.country,
          j.salary_min,
          j.salary_max,
          j.salary_currency,
          cu.company_name,
          cp.logo_url as company_logo,
          cp.description as company_description
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE a.id = ? AND a.talent_profile_id = ?`,
        [id, talentProfileId]
      );

      if (!application) {
        throw new CustomError('Candidatura não encontrada', 404);
      }

      // Normalizar dados
      const normalizedApplication = {
        id: application.id,
        status: application.status,
        appliedAt: application.applied_at,
        notes: application.cover_letter || null,
        feedback: application.feedback,
        job: {
          id: application.job_id,
          title: application.job_title,
          description: application.job_description,
          jobType: application.job_type,
          location: {
            city: application.city,
            province: application.province,
            country: application.country,
          },
          salary: {
            min: application.salary_min ? Number(application.salary_min) : null,
            max: application.salary_max ? Number(application.salary_max) : null,
            currency: application.salary_currency,
          },
        },
        company: {
          name: application.company_name,
          logo: application.company_logo,
          description: application.company_description,
        },
      };

      res.status(200).json(createSuccessResponse(normalizedApplication));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /talent/applications
   * Criar nova candidatura
   */
  static async createApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId, notes } = req.body;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      if (!jobId) {
        throw new CustomError('ID da vaga é obrigatório', 400);
      }

      // Obter ou criar talent_profile_id
      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      // Verificar se vaga existe e está ativa
      const job = await queryOne<any>(
        `SELECT id, company_id FROM jobs WHERE id = ? AND status = 'active'`,
        [jobId]
      );

      if (!job) {
        throw new CustomError('Vaga não encontrada ou não está mais disponível', 404);
      }

      // Verificar se já se candidatou
      const existing = await queryOne<any>(
        `SELECT id FROM applications WHERE job_id = ? AND talent_profile_id = ?`,
        [jobId, talentProfileId]
      );

      if (existing) {
        throw new CustomError('Você já se candidatou a esta vaga', 400);
      }

      // Criar candidatura
      const applicationId = generateUUID();
      await execute(
        `INSERT INTO applications (
          id, job_id, talent_profile_id, status, applied_at, cover_letter
        ) VALUES (?, ?, ?, 'pending', NOW(), ?)`,
        [applicationId, jobId, talentProfileId, notes || null]
      );

      // Incrementar contador de candidaturas da vaga
      await execute(
        `UPDATE jobs SET applications_count = COALESCE(applications_count, 0) + 1 WHERE id = ?`,
        [jobId]
      );

      // TODO: Criar notificação para a empresa

      res.status(201).json(
        createSuccessResponse(
          { id: applicationId, message: 'Candidatura enviada com sucesso' },
          'Candidatura criada com sucesso'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /talent/applications/:id
   * Cancelar candidatura
   */
  static async cancelApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar talent_profile_id
      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      // Verificar se candidatura existe e pertence ao talento
      const application = await queryOne<any>(
        `SELECT id, job_id, status FROM applications 
         WHERE id = ? AND talent_profile_id = ?`,
        [id, talentProfileId]
      );

      if (!application) {
        throw new CustomError('Candidatura não encontrada', 404);
      }

      // Verificar se pode cancelar (apenas pending, reviewing, shortlisted)
      const cancelableStatuses = ['pending', 'reviewing', 'shortlisted'];
      if (!cancelableStatuses.includes(application.status)) {
        throw new CustomError(
          `Não é possível cancelar uma candidatura com status "${application.status}"`,
          400
        );
      }

      // Deletar candidatura
      await execute(
        `DELETE FROM applications WHERE id = ?`,
        [id]
      );

      // Decrementar contador de candidaturas da vaga
      await execute(
        `UPDATE jobs SET applications_count = GREATEST(COALESCE(applications_count, 0) - 1, 0) WHERE id = ?`,
        [application.job_id]
      );

      res.status(200).json(createSuccessResponse({ message: 'Candidatura cancelada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }
}

