import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne } from '../../utils/database';

export class AdminApplicationsController {
  /**
   * GET /admin/applications
   * Listar todas as candidaturas (admin pode ver todas)
   */
  static async listApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

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
      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      const whereConditions: string[] = [];
      const params: any[] = [];

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
          '(tu.first_name LIKE ? OR tu.last_name LIKE ? OR u.email LIKE ? OR j.title LIKE ?)'
        );
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // Contar total
      const countResult = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications a
         INNER JOIN talent_profiles tp ON a.talent_profile_id = tp.id
         INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
         INNER JOIN users u ON tu.user_id = u.id
         INNER JOIN jobs j ON a.job_id = j.id
         INNER JOIN company_profiles cp ON j.company_id = cp.id
         INNER JOIN company_users cu ON cp.company_user_id = cu.id
         ${whereClause}`,
        params
      );

      const total = countResult?.count || 0;

      // Buscar candidaturas
      const applications = await query<any>(
        `SELECT 
          a.id,
          a.job_id,
          a.status,
          a.applied_at,
          a.cover_letter,
          a.status_changed_at,
          j.title as job_title,
          j.job_type,
          j.city as job_city,
          j.province as job_province,
          j.country as job_country,
          tu.first_name,
          tu.last_name,
          tu.phone,
          tu.profile_picture_url,
          u.email as talent_email,
          tp.title as talent_title,
          tp.city as talent_city,
          tp.province as talent_province,
          tp.country as talent_country,
          cu.company_name,
          cp.logo_url as company_logo
        FROM applications a
        INNER JOIN talent_profiles tp ON a.talent_profile_id = tp.id
        INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
        INNER JOIN users u ON tu.user_id = u.id
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        ${whereClause}
        ORDER BY a.applied_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Normalizar dados
      const normalizedApplications = applications.map((app: any) => ({
        id: app.id,
        job: {
          id: app.job_id,
          title: app.job_title,
          jobType: app.job_type,
          location: {
            city: app.job_city,
            province: app.job_province,
            country: app.job_country,
          },
        },
        talent: {
          firstName: app.first_name,
          lastName: app.last_name,
          email: app.talent_email,
          phone: app.phone,
          profilePicture: app.profile_picture_url,
          title: app.talent_title,
          location: {
            city: app.talent_city,
            province: app.talent_province,
            country: app.talent_country,
          },
        },
        company: {
          name: app.company_name,
          logo: app.company_logo,
        },
        status: app.status,
        appliedAt: app.applied_at,
        coverLetter: app.cover_letter,
        statusChangedAt: app.status_changed_at,
      }));

      res.status(200).json(
        createSuccessResponse({
          applications: normalizedApplications,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/jobs/:jobId/applications
   * Listar candidaturas de uma vaga específica
   */
  static async getJobApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      
      // Usar o método listApplications com jobId
      req.query.jobId = jobId;
      return AdminApplicationsController.listApplications(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/applications/stats
   * Obter estatísticas de candidaturas
   */
  static async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Estatísticas gerais
      const totalApplications = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM applications'
      );

      const pendingApplications = await queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM applications WHERE status = 'pending'"
      );

      const hiredApplications = await queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM applications WHERE status = 'hired'"
      );

      // Candidaturas por status
      const statusBreakdown = await query<any>(
        `SELECT status, COUNT(*) as count
         FROM applications
         GROUP BY status`
      );

      // Candidaturas por mês (últimos 6 meses)
      const monthlyApplications = await query<any>(
        `SELECT 
          DATE_FORMAT(applied_at, '%Y-%m') as month,
          COUNT(*) as count
         FROM applications
         WHERE applied_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
         GROUP BY DATE_FORMAT(applied_at, '%Y-%m')
         ORDER BY month DESC`
      );

      res.status(200).json(
        createSuccessResponse({
          total: totalApplications?.count || 0,
          pending: pendingApplications?.count || 0,
          hired: hiredApplications?.count || 0,
          statusBreakdown: statusBreakdown.map((s: any) => ({
            status: s.status,
            count: s.count,
          })),
          monthlyApplications: monthlyApplications.map((m: any) => ({
            month: m.month,
            count: m.count,
          })),
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

