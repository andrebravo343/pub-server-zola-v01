import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { queryOne, query } from '../../utils/database';
import { getOrCreateTalentProfileId } from '../../utils/talentHelper';

export class TalentDashboardController {
  /**
   * GET /talent/dashboard/stats
   * Obter estatísticas do dashboard do talento
   */
  static async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter ou criar talent_profile_id
      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);

      // Candidaturas ativas (pending, reviewing, shortlisted, interview, offer)
      const activeApplications = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications
         WHERE talent_profile_id = ? 
           AND status IN ('pending', 'reviewing', 'shortlisted', 'interview', 'offer')`,
        [talentProfileId]
      );

      // Total de candidaturas
      const totalApplications = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications
         WHERE talent_profile_id = ?`,
        [talentProfileId]
      );

      // Candidaturas recentes (últimas 5)
      const recentApplications = await query<any>(
        `SELECT 
          a.id,
          a.status,
          a.applied_at,
          j.id as job_id,
          j.title as job_title,
          j.company_id,
          cu.company_name
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE a.talent_profile_id = ?
        ORDER BY a.applied_at DESC
        LIMIT 5`,
        [talentProfileId]
      );

      // Candidaturas por status
      const applicationsByStatus = await query<any>(
        `SELECT 
          status,
          COUNT(*) as count
        FROM applications
        WHERE talent_profile_id = ?
        GROUP BY status`,
        [talentProfileId]
      );

      // Candidaturas este mês
      const applicationsThisMonth = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM applications
         WHERE talent_profile_id = ? AND applied_at >= ?`,
        [talentProfileId, startOfMonth]
      );

      // Vagas salvas/favoritas (se existir tabela saved_jobs)
      let savedJobsCount = 0;
      try {
        const savedJobs = await queryOne<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM saved_jobs
           WHERE talent_profile_id = ?`,
          [talentProfileId]
        );
        savedJobsCount = savedJobs?.count || 0;
      } catch (error) {
        // Tabela pode não existir ainda
        console.log('Tabela saved_jobs não encontrada, usando 0');
      }

      // Cursos em progresso (se existir tabela course_enrollments)
      let coursesInProgress = 0;
      try {
        const courses = await queryOne<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM course_enrollments
           WHERE talent_profile_id = ? AND enrollment_status = 'in_progress'`,
          [talentProfileId]
        );
        coursesInProgress = courses?.count || 0;
      } catch (error) {
        // Tabela pode não existir ainda
        console.log('Tabela course_enrollments não encontrada, usando 0');
      }

      // Certificados obtidos (se existir tabela certificates)
      // Nota: A tabela certificates não tem coluna 'status', apenas 'is_revoked'
      let certificatesCount = 0;
      try {
        const certificates = await queryOne<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM certificates
           WHERE talent_profile_id = ? AND is_revoked = FALSE`,
          [talentProfileId]
        );
        certificatesCount = certificates?.count || 0;
      } catch (error) {
        // Tabela pode não existir ainda
        console.log('Tabela certificates não encontrada, usando 0');
      }

      // Perfil visualizado (views do perfil)
      const profileViews = await queryOne<{ count: number }>(
        `SELECT profile_views as count
         FROM talent_profiles
         WHERE id = ?`,
        [talentProfileId]
      );

      // Taxa de conversão (candidaturas aceitas / total)
      const conversionStats = await queryOne<any>(
        `SELECT 
          COUNT(CASE WHEN status = 'hired' THEN 1 END) as hired_count,
          COUNT(*) as total_applications
        FROM applications
        WHERE talent_profile_id = ?`,
        [talentProfileId]
      );

      const conversionRate = conversionStats?.total_applications > 0
        ? ((conversionStats.hired_count / conversionStats.total_applications) * 100).toFixed(1)
        : '0.0';

      // Normalizar dados
      const stats = {
        activeApplications: activeApplications?.count || 0,
        totalApplications: totalApplications?.count || 0,
        applicationsThisMonth: applicationsThisMonth?.count || 0,
        savedJobs: savedJobsCount,
        coursesInProgress: coursesInProgress,
        certificates: certificatesCount,
        profileViews: profileViews?.count || 0,
        applicationsByStatus: applicationsByStatus.reduce((acc: any, item: any) => {
          acc[item.status] = item.count;
          return acc;
        }, {}),
        recentApplications: recentApplications.map((app: any) => ({
          id: app.id,
          status: app.status,
          appliedAt: app.applied_at,
          jobId: app.job_id,
          jobTitle: app.job_title,
          companyName: app.company_name,
        })),
        conversionRate: parseFloat(conversionRate),
        hiredCount: conversionStats?.hired_count || 0,
      };

      res.status(200).json(createSuccessResponse(stats));
    } catch (error) {
      next(error);
    }
  }
}

