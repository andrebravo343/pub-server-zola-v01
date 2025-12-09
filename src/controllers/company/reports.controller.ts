import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { queryOne, query } from '../../utils/database';
import { getOrCreateCompanyProfileId } from '../../utils/companyHelper';

export class CompanyReportsController {
  /**
   * GET /company/reports
   * Obter relatórios e métricas da empresa
   */
  static async getReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { period = 'month' } = req.query; // 'week' | 'month' | 'quarter' | 'year'

      // Obter ou criar company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      // Calcular datas baseado no período
      const now = new Date();
      let startDate: Date;
      
      switch (period) {
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default: // month
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      // Métricas principais
      const totalJobs = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM jobs WHERE company_id = ? AND created_at >= ?`,
        [companyProfileId, startDate]
      );

      const totalApplications = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         WHERE j.company_id = ? AND a.applied_at >= ?`,
        [companyProfileId, startDate]
      );

      const hiredCount = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         WHERE j.company_id = ? AND a.status = 'hired' AND a.applied_at >= ?`,
        [companyProfileId, startDate]
      );

      // Time-to-hire médio (em dias)
      const avgTimeToHire = await queryOne<{ avg_days: number }>(
        `SELECT AVG(DATEDIFF(a.status_changed_at, a.applied_at)) as avg_days
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         WHERE j.company_id = ? AND a.status = 'hired' AND a.status_changed_at IS NOT NULL AND a.applied_at >= ?`,
        [companyProfileId, startDate]
      );

      // Taxa de conversão (candidaturas -> contratados)
      const totalAppsCount = totalApplications?.count || 0;
      const hiredCountValue = hiredCount?.count || 0;
      const conversionRate = totalAppsCount > 0
        ? ((hiredCountValue / totalAppsCount) * 100).toFixed(1)
        : '0.0';

      // Candidatos por vaga
      const avgCandidatesPerJob = await queryOne<{ avg: number }>(
        `SELECT AVG(application_count) as avg
         FROM (
           SELECT COUNT(*) as application_count
           FROM applications a
           INNER JOIN jobs j ON a.job_id = j.id
           WHERE j.company_id = ? AND a.applied_at >= ?
           GROUP BY j.id
         ) as job_apps`,
        [companyProfileId, startDate]
      );

      // Funil de recrutamento
      const funnelData = await query<any>(
        `SELECT 
          a.status,
          COUNT(*) as count
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        WHERE j.company_id = ? AND a.applied_at >= ?
        GROUP BY a.status
        ORDER BY 
          CASE a.status
            WHEN 'pending' THEN 1
            WHEN 'screening' THEN 2
            WHEN 'interview' THEN 3
            WHEN 'offer' THEN 4
            WHEN 'hired' THEN 5
            WHEN 'rejected' THEN 6
            ELSE 7
          END`,
        [companyProfileId, startDate]
      );

      // Contratações recentes
      const recentHires = await query<any>(
        `SELECT 
          a.id,
          a.applied_at,
          a.status_changed_at,
          j.title as job_title,
          tu.first_name,
          tu.last_name,
          u.email
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN talent_profiles tp ON a.talent_profile_id = tp.id
        INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
        INNER JOIN users u ON tu.user_id = u.id
        WHERE j.company_id = ? AND a.status = 'hired' AND a.applied_at >= ?
        ORDER BY a.status_changed_at DESC
        LIMIT 10`,
        [companyProfileId, startDate]
      );

      // Comparação com período anterior
      const previousStartDate = new Date(startDate);
      const previousEndDate = new Date(startDate);
      previousStartDate.setTime(startDate.getTime() - (now.getTime() - startDate.getTime()));

      const previousTotalApplications = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         WHERE j.company_id = ? AND a.applied_at >= ? AND a.applied_at < ?`,
        [companyProfileId, previousStartDate, previousEndDate]
      );

      const previousTotalAppsCount = previousTotalApplications?.count || 0;
      const applicationsChange = previousTotalAppsCount > 0
        ? (((totalAppsCount - previousTotalAppsCount) / previousTotalAppsCount) * 100).toFixed(1)
        : '0.0';

      const previousHiredCount = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications a
         INNER JOIN jobs j ON a.job_id = j.id
         WHERE j.company_id = ? AND a.status = 'hired' AND a.applied_at >= ? AND a.applied_at < ?`,
        [companyProfileId, previousStartDate, previousEndDate]
      );

      const previousHiredCountValue = previousHiredCount?.count || 0;
      const hiredChange = previousHiredCountValue > 0
        ? (((hiredCountValue - previousHiredCountValue) / previousHiredCountValue) * 100).toFixed(1)
        : '0.0';

      const reports = {
        period,
        metrics: [
          {
            label: 'Time-to-Hire Médio',
            value: avgTimeToHire?.avg_days ? `${Math.round(avgTimeToHire.avg_days)} dias` : 'N/A',
            change: 0, // TODO: Calcular mudança
            icon: 'Clock',
            color: 'blue',
          },
          {
            label: 'Taxa de Conversão',
            value: `${conversionRate}%`,
            change: parseFloat(hiredChange),
            icon: 'TrendingUp',
            color: 'green',
          },
          {
            label: 'Candidatos por Vaga',
            value: avgCandidatesPerJob?.avg ? `${Math.round(avgCandidatesPerJob.avg)}` : '0',
            change: parseFloat(applicationsChange),
            icon: 'Users',
            color: 'purple',
          },
        ],
        funnelData: funnelData.map((item: any) => ({
          stage: item.status,
          count: item.count,
        })),
        recentHires: recentHires.map((hire: any) => ({
          id: hire.id,
          jobTitle: hire.job_title,
          talentName: `${hire.first_name} ${hire.last_name}`,
          talentEmail: hire.email,
          appliedAt: hire.applied_at,
          hiredAt: hire.status_changed_at,
        })),
        summary: {
          totalJobs: totalJobs?.count || 0,
          totalApplications: totalApplications?.count || 0,
          hiredCount: hiredCount?.count || 0,
          conversionRate: parseFloat(conversionRate),
          avgTimeToHire: avgTimeToHire?.avg_days ? Math.round(avgTimeToHire.avg_days) : null,
          avgCandidatesPerJob: avgCandidatesPerJob?.avg ? Math.round(avgCandidatesPerJob.avg) : 0,
        },
      };

      res.status(200).json(createSuccessResponse(reports));
    } catch (error) {
      next(error);
    }
  }
}

