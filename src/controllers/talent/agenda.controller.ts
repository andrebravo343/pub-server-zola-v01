import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query } from '../../utils/database';
import { getOrCreateTalentProfileId } from '../../utils/talentHelper';

export class TalentAgendaController {
  /**
   * GET /talent/agenda/events
   * Listar eventos da agenda (entrevistas, etc)
   */
  static async listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      const {
        startDate,
        endDate,
        // type = 'all', // 'all' | 'interview' | 'deadline' - Para uso futuro
      } = req.query;

      // Buscar entrevistas agendadas
      const interviews = await query<any>(
        `SELECT 
          i.id,
          i.interview_type,
          i.scheduled_at,
          i.duration_minutes,
          i.location,
          i.video_link,
          i.interviewer_name,
          i.interviewer_email,
          i.status,
          i.candidate_confirmed,
          a.id as application_id,
          j.title as job_title,
          cu.company_name,
          cp.logo_url as company_logo
        FROM interviews i
        INNER JOIN applications a ON i.application_id = a.id
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN company_profiles cp ON j.company_id = cp.id
        INNER JOIN company_users cu ON cp.company_user_id = cu.id
        WHERE a.talent_profile_id = ?
          AND i.status IN ('scheduled', 'confirmed')
          ${startDate ? 'AND i.scheduled_at >= ?' : ''}
          ${endDate ? 'AND i.scheduled_at <= ?' : ''}
        ORDER BY i.scheduled_at ASC`,
        [
          talentProfileId,
          ...(startDate ? [startDate] : []),
          ...(endDate ? [endDate] : []),
        ].filter(Boolean)
      );

      // Normalizar dados
      const normalizedEvents = interviews.map((interview: any) => {
        const scheduledDate = new Date(interview.scheduled_at);
        const isOnline = interview.interview_type === 'video' || interview.video_link;
        
        return {
          id: interview.id,
          type: 'entrevista',
          title: `Entrevista - ${interview.job_title}`,
          company: interview.company_name,
          companyLogo: interview.company_logo,
          date: scheduledDate.toISOString().split('T')[0],
          time: scheduledDate.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' }),
          location: isOnline ? 'Online' : interview.location || 'A definir',
          isOnline,
          link: interview.video_link,
          status: interview.status,
          confirmed: interview.candidate_confirmed,
          interviewerName: interview.interviewer_name,
          interviewerEmail: interview.interviewer_email,
          duration: interview.duration_minutes || 60,
          applicationId: interview.application_id,
          jobTitle: interview.job_title,
        };
      });

      res.status(200).json(
        createSuccessResponse({
          events: normalizedEvents,
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

