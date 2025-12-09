import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne, execute } from '../../utils/database';
import { generateUUID } from '../../utils/uuid';
import { getOrCreateCompanyProfileId } from '../../utils/companyHelper';

export class CompanyApplicationsController {
  /**
   * GET /company/applications
   * Listar candidaturas da empresa (com filtros e paginação)
   */
  static async listApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      const {
        jobId,
        status = 'all',
        search = '',
        page = 1,
        limit = 20,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      const whereConditions: string[] = [
        'j.company_id = ?',
      ];
      const params: any[] = [companyProfileId];

      if (jobId) {
        whereConditions.push('a.job_id = ?');
        params.push(jobId);
      }

      if (status !== 'all') {
        whereConditions.push('a.status = ?');
        params.push(status);
      }

      if (search) {
        whereConditions.push(
          '(tu.first_name LIKE ? OR tu.last_name LIKE ? OR u.email LIKE ?)'
        );
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(DISTINCT a.id) as total
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         INNER JOIN talent_profiles tp ON a.talent_profile_id = tp.id
         INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
         INNER JOIN users u ON tu.user_id = u.id
         ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      // Buscar candidaturas
      const applications = await query<any>(
        `SELECT 
          a.id,
          a.job_id,
          a.talent_profile_id,
          a.status,
          a.cover_letter,
          a.application_source,
          a.feedback,
          a.feedback_given_at,
          a.applied_at,
          a.status_changed_at,
          a.created_at,
          a.updated_at,
          j.title as job_title,
          tu.first_name,
          tu.last_name,
          tu.phone,
          tu.profile_picture_url,
          u.email as talent_email,
          tp.has_zolangola_badge,
          tp.title,
          tp.city,
          tp.province,
          tp.country
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN talent_profiles tp ON a.talent_profile_id = tp.id
        INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
        INNER JOIN users u ON tu.user_id = u.id
        ${whereClause}
        ORDER BY a.applied_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Normalizar dados
      const normalizedApplications = applications.map((app: any) => ({
        id: app.id,
        jobId: app.job_id,
        jobTitle: app.job_title,
        talentProfileId: app.talent_profile_id,
        talent: {
          id: app.talent_profile_id,
          firstName: app.first_name,
          lastName: app.last_name,
          fullName: `${app.first_name} ${app.last_name}`,
          email: app.talent_email,
          phone: app.phone,
          profilePictureUrl: app.profile_picture_url,
          hasZolangolaBadge: Boolean(app.has_zolangola_badge),
          title: app.title,
          location: `${app.city || ''} ${app.province || ''}`.trim() || app.country || 'Angola',
        },
        status: app.status,
        coverLetter: app.cover_letter,
        applicationSource: app.application_source,
        feedback: app.feedback,
        feedbackGivenAt: app.feedback_given_at,
        appliedAt: app.applied_at,
        statusChangedAt: app.status_changed_at,
        createdAt: app.created_at,
        updatedAt: app.updated_at,
      }));

      res.status(200).json(
        createSuccessResponse({
          applications: normalizedApplications,
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
   * GET /company/applications/:id
   * Obter detalhes de uma candidatura
   */
  static async getApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se a candidatura pertence a uma vaga da empresa
      const application = await queryOne<any>(
        `SELECT 
          a.*,
          j.title as job_title,
          j.company_id,
          u.email,
          tu.first_name,
          tu.last_name,
          tu.phone,
          tu.profile_picture_url,
          tu.date_of_birth,
          tu.nationality,
          tu.gender,
          tp.*
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        INNER JOIN talent_profiles tp ON a.talent_profile_id = tp.id
        INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
        INNER JOIN users u ON tu.user_id = u.id
        WHERE a.id = ? AND cu.user_id = ?`,
        [id, userId]
      );

      if (!application) {
        throw new CustomError('Candidatura não encontrada ou acesso negado', 404);
      }

      // Normalizar dados
      const normalizedApplication = {
        id: application.id,
        jobId: application.job_id,
        jobTitle: application.job_title,
        talentProfileId: application.talent_profile_id,
        talent: {
          id: application.talent_profile_id,
          firstName: application.first_name,
          lastName: application.last_name,
          fullName: `${application.first_name} ${application.last_name}`,
          email: application.email,
          phone: application.phone,
          profilePictureUrl: application.profile_picture_url,
          dateOfBirth: application.date_of_birth,
          nationality: application.nationality,
          gender: application.gender,
          hasZolangolaBadge: Boolean(application.has_zolangola_badge),
          experienceLevel: application.experience_level,
          currentPosition: application.current_position,
          location: application.location,
          bio: application.bio,
          skills: application.skills ? JSON.parse(application.skills) : [],
          education: application.education ? JSON.parse(application.education) : [],
          experience: application.experience ? JSON.parse(application.experience) : [],
        },
        status: application.status,
        coverLetter: application.cover_letter,
        applicationSource: application.application_source,
        feedback: application.feedback,
        feedbackGivenAt: application.feedback_given_at,
        appliedAt: application.applied_at,
        statusChangedAt: application.status_changed_at,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
      };

      res.status(200).json(createSuccessResponse(normalizedApplication));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /company/applications/:id/status
   * Atualizar status de uma candidatura
   */
  static async updateApplicationStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      if (!status || !['pending', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'].includes(status)) {
        throw new CustomError('Status inválido', 400);
      }

      // Verificar se a candidatura pertence a uma vaga da empresa
      const existingApplication = await queryOne<any>(
        `SELECT a.*, j.company_id
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE a.id = ? AND cu.user_id = ?`,
        [id, userId]
      );

      if (!existingApplication) {
        throw new CustomError('Candidatura não encontrada ou acesso negado', 404);
      }

      const oldStatus = existingApplication.status;

      // Atualizar status
      await execute(
        `UPDATE applications 
         SET status = ?, status_changed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [status, id]
      );

      // Registrar no histórico
      await execute(
        `INSERT INTO application_status_history 
         (id, application_id, old_status, new_status, changed_by, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [generateUUID(), id, oldStatus, status, userId, notes || null]
      );

      res.status(200).json(createSuccessResponse({ status }, 'Status da candidatura atualizado com sucesso'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /company/applications/:id/feedback
   * Adicionar feedback a uma candidatura
   */
  static async addFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;
      const { feedback } = req.body;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      if (!feedback || feedback.trim().length === 0) {
        throw new CustomError('Feedback é obrigatório', 400);
      }

      // Verificar se a candidatura pertence a uma vaga da empresa
      const application = await queryOne<any>(
        `SELECT a.id
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE a.id = ? AND cu.user_id = ?`,
        [id, userId]
      );

      if (!application) {
        throw new CustomError('Candidatura não encontrada ou acesso negado', 404);
      }

      // Atualizar feedback
      await execute(
        `UPDATE applications 
         SET feedback = ?, feedback_given_at = NOW(), feedback_given_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [feedback.trim(), userId, id]
      );

      res.status(200).json(createSuccessResponse(null, 'Feedback adicionado com sucesso'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /company/applications/:id/history
   * Obter histórico de mudanças de status de uma candidatura
   */
  static async getApplicationHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se a candidatura pertence a uma vaga da empresa
      const application = await queryOne<any>(
        `SELECT a.id
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE a.id = ? AND cu.user_id = ?`,
        [id, userId]
      );

      if (!application) {
        throw new CustomError('Candidatura não encontrada ou acesso negado', 404);
      }

      // Buscar histórico
      const history = await query<any>(
        `SELECT 
          ash.id,
          ash.old_status,
          ash.new_status,
          ash.notes,
          ash.created_at,
          u.email as changed_by_email
        FROM application_status_history ash
        LEFT JOIN users u ON ash.changed_by = u.id
        WHERE ash.application_id = ?
        ORDER BY ash.created_at DESC`,
        [id]
      );

      const normalizedHistory = history.map((item: any) => ({
        id: item.id,
        oldStatus: item.old_status,
        newStatus: item.new_status,
        notes: item.notes,
        changedBy: item.changed_by_email,
        createdAt: item.created_at,
      }));

      res.status(200).json(createSuccessResponse({ history: normalizedHistory }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /company/jobs/:jobId/applications
   * Listar candidaturas de uma vaga específica
   */
  static async getJobApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.params;

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
        [jobId, userId]
      );

      if (!job) {
        throw new CustomError('Vaga não encontrada ou acesso negado', 404);
      }

      // Usar o método listApplications com jobId
      req.query.jobId = jobId;
      return CompanyApplicationsController.listApplications(req, res, next);
    } catch (error) {
      next(error);
    }
  }
}

