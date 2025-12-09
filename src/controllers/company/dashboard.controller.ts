import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { queryOne, query } from '../../utils/database';
import { getOrCreateCompanyProfileId } from '../../utils/companyHelper';

export class CompanyDashboardController {
  /**
   * GET /company/dashboard/stats
   * Obter estatísticas do dashboard da empresa
   */
  static async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);

      // Total de vagas ativas
      const activeJobs = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM jobs 
         WHERE company_id = ? AND status = 'active'`,
        [companyProfileId]
      );

      // Total de candidaturas recebidas
      const totalApplications = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         WHERE j.company_id = ?`,
        [companyProfileId]
      );

      // Candidaturas por status
      const applicationsByStatus = await query<any>(
        `SELECT 
          a.status,
          COUNT(*) as count
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        WHERE j.company_id = ?
        GROUP BY a.status`,
        [companyProfileId]
      );

      // Candidaturas recentes (últimos 7 dias)
      const recentApplications = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         WHERE j.company_id = ? AND a.applied_at >= ?`,
        [companyProfileId, startOfWeek]
      );

      // Candidaturas este mês
      const applicationsThisMonth = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         WHERE j.company_id = ? AND a.applied_at >= ?`,
        [companyProfileId, startOfMonth]
      );

      // Vagas mais visualizadas (top 5)
      const topViewedJobs = await query<any>(
        `SELECT 
          id,
          title,
          views_count,
          applications_count
        FROM jobs
        WHERE company_id = ? AND status = 'active'
        ORDER BY views_count DESC
        LIMIT 5`,
        [companyProfileId]
      );

      // Candidaturas recentes (últimas 5)
      const latestApplications = await query<any>(
        `SELECT 
          a.id,
          a.status,
          a.applied_at,
          j.title as job_title,
          tu.first_name,
          tu.last_name,
          u.email as talent_email
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN talent_profiles tp ON a.talent_profile_id = tp.id
        INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
        INNER JOIN users u ON tu.user_id = u.id
        WHERE j.company_id = ?
        ORDER BY a.applied_at DESC
        LIMIT 5`,
        [companyProfileId]
      );

      // Estatísticas de conversão
      const conversionStats = await queryOne<any>(
        `SELECT 
          COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hired_count,
          COUNT(CASE WHEN a.status IN ('interview', 'offer') THEN 1 END) as in_process_count,
          COUNT(*) as total_applications
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        WHERE j.company_id = ?`,
        [companyProfileId]
      );

      const conversionRate = conversionStats?.total_applications > 0
        ? ((conversionStats.hired_count / conversionStats.total_applications) * 100).toFixed(1)
        : '0.0';

      // Normalizar dados
      const stats = {
        activeJobs: activeJobs?.count || 0,
        totalApplications: totalApplications?.count || 0,
        recentApplications: recentApplications?.count || 0,
        applicationsThisMonth: applicationsThisMonth?.count || 0,
        applicationsByStatus: applicationsByStatus.reduce((acc: any, item: any) => {
          acc[item.status] = item.count;
          return acc;
        }, {}),
        topViewedJobs: topViewedJobs.map((job: any) => ({
          id: job.id,
          title: job.title,
          viewsCount: job.views_count || 0,
          applicationsCount: job.applications_count || 0,
        })),
        latestApplications: latestApplications.map((app: any) => ({
          id: app.id,
          status: app.status,
          appliedAt: app.applied_at,
          jobTitle: app.job_title,
          talentName: `${app.first_name} ${app.last_name}`,
          talentEmail: app.talent_email,
        })),
        conversionRate: parseFloat(conversionRate),
        hiredCount: conversionStats?.hired_count || 0,
        inProcessCount: conversionStats?.in_process_count || 0,
      };

      res.status(200).json(createSuccessResponse(stats));
    } catch (error) {
      next(error);
    }
  }
}

