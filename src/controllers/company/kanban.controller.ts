import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne, execute } from '../../utils/database';
import { generateUUID } from '../../utils/uuid';
import { getOrCreateCompanyProfileId } from '../../utils/companyHelper';

export class CompanyKanbanController {
  /**
   * GET /company/kanban
   * Obter dados do Kanban (candidaturas organizadas por estágio)
   */
  static async getKanbanData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.query;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      const whereConditions: string[] = ['j.company_id = ?'];
      const params: any[] = [companyProfileId];

      if (jobId) {
        whereConditions.push('j.id = ?');
        params.push(jobId);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Buscar candidaturas com dados do candidato
      const applications = await query<any>(
        `SELECT 
          a.id,
          a.job_id,
          a.talent_profile_id,
          a.status,
          a.cover_letter,
          a.applied_at,
          a.status_changed_at,
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
        ORDER BY a.applied_at DESC`,
        params
      );

      // Organizar por estágio
      const stages = {
        triagem: applications.filter((app: any) => app.status === 'pending' || app.status === 'screening'),
        entrevista: applications.filter((app: any) => app.status === 'interview'),
        proposta: applications.filter((app: any) => app.status === 'offer'),
        contratacao: applications.filter((app: any) => app.status === 'hired'),
      };

      // Normalizar dados
      const normalizeApplication = (app: any) => ({
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
        appliedAt: app.applied_at,
        statusChangedAt: app.status_changed_at,
      });

      const kanbanData = {
        stages: {
          triagem: stages.triagem.map(normalizeApplication),
          entrevista: stages.entrevista.map(normalizeApplication),
          proposta: stages.proposta.map(normalizeApplication),
          contratacao: stages.contratacao.map(normalizeApplication),
        },
        stats: {
          total: applications.length,
          triagem: stages.triagem.length,
          entrevista: stages.entrevista.length,
          proposta: stages.proposta.length,
          contratacao: stages.contratacao.length,
        },
      };

      res.status(200).json(createSuccessResponse(kanbanData));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /company/kanban/move
   * Mover candidatura entre estágios
   */
  static async moveApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { applicationId, newStatus, notes } = req.body;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      if (!applicationId || !newStatus) {
        throw new CustomError('ID da candidatura e novo status são obrigatórios', 400);
      }

      // Validar status
      const validStatuses = ['pending', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];
      if (!validStatuses.includes(newStatus)) {
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
        [applicationId, userId]
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
        [newStatus, applicationId]
      );

      // Registrar no histórico
      await execute(
        `INSERT INTO application_status_history 
         (id, application_id, old_status, new_status, changed_by, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [generateUUID(), applicationId, oldStatus, newStatus, userId, notes || null]
      );

      res.status(200).json(createSuccessResponse({ status: newStatus }, 'Candidatura movida com sucesso'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /company/kanban/:applicationId/notes
   * Adicionar notas a uma candidatura no Kanban
   */
  static async addNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { applicationId } = req.params;
      const { notes } = req.body;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      if (!notes || notes.trim().length === 0) {
        throw new CustomError('Notas são obrigatórias', 400);
      }

      // Verificar se a candidatura pertence a uma vaga da empresa
      const application = await queryOne<any>(
        `SELECT a.id, a.status
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         WHERE a.id = ? AND cu.user_id = ?`,
        [applicationId, userId]
      );

      if (!application) {
        throw new CustomError('Candidatura não encontrada ou acesso negado', 404);
      }

      // Registrar nota no histórico (usando o status atual)
      await execute(
        `INSERT INTO application_status_history 
         (id, application_id, old_status, new_status, changed_by, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [generateUUID(), applicationId, application.status, application.status, userId, notes.trim()]
      );

      res.status(200).json(createSuccessResponse(null, 'Nota adicionada com sucesso'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /company/kanban/stats
   * Obter estatísticas do Kanban
   */
  static async getKanbanStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.query;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      const whereConditions: string[] = ['j.company_id = ?'];
      const params: any[] = [companyProfileId];

      if (jobId) {
        whereConditions.push('j.id = ?');
        params.push(jobId);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Estatísticas por status
      const statsByStatus = await query<any>(
        `SELECT 
          a.status,
          COUNT(*) as count
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        ${whereClause}
        GROUP BY a.status`,
        params
      );

      // Tempo médio em cada estágio
      const avgTimeInStage = await query<any>(
        `SELECT 
          ash.new_status as status,
          AVG(TIMESTAMPDIFF(HOUR, 
            (SELECT created_at FROM application_status_history ash2 
             WHERE ash2.application_id = ash.application_id 
             AND ash2.new_status = ash.old_status 
             ORDER BY created_at DESC LIMIT 1),
            ash.created_at
          )) as avg_hours
        FROM application_status_history ash
        INNER JOIN applications a ON ash.application_id = a.id
        INNER JOIN jobs j ON a.job_id = j.id
        ${whereClause.replace('j.company_id', 'j.company_id')}
        WHERE ash.old_status IS NOT NULL
        GROUP BY ash.new_status`,
        params
      );

      const stats = {
        byStatus: statsByStatus.reduce((acc: any, item: any) => {
          acc[item.status] = item.count;
          return acc;
        }, {}),
        avgTimeInStage: avgTimeInStage.reduce((acc: any, item: any) => {
          acc[item.status] = Math.round(item.avg_hours || 0);
          return acc;
        }, {}),
      };

      res.status(200).json(createSuccessResponse(stats));
    } catch (error) {
      next(error);
    }
  }
}

