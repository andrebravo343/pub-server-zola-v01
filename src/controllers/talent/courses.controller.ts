import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne } from '../../utils/database';
import { getOrCreateTalentProfileId } from '../../utils/talentHelper';

export class TalentCoursesController {
  /**
   * GET /talent/courses
   * Listar cursos do talento (inscritos e disponíveis)
   */
  static async listCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      const {
        status = 'all', // 'all' | 'enrolled' | 'in_progress' | 'completed' | 'available'
        page = 1,
        limit = 20,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor((pageNum - 1) * limitNum);

      let courses: any[] = [];
      let total = 0;

      if (status === 'available') {
        // Buscar apenas cursos disponíveis (não inscritos)
        const availableCourses = await query<any>(
          `SELECT 
            c.id,
            c.title,
            c.description,
            c.instructor_name,
            c.category,
            c.level,
            c.duration_hours,
            c.price,
            c.price_currency,
            c.enrollment_count,
            c.rating,
            c.rating_count,
            FALSE as is_enrolled,
            NULL as enrollment_status,
            NULL as progress_percentage,
            NULL as enrolled_at
          FROM courses c
          WHERE c.is_active = TRUE
            AND c.id NOT IN (
              SELECT course_id FROM course_enrollments WHERE talent_profile_id = ?
            )
          ORDER BY c.created_at DESC
          LIMIT ${safeLimit} OFFSET ${safeOffset}`,
          [talentProfileId]
        );

        const totalCount = await queryOne<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM courses c
           WHERE c.is_active = TRUE
             AND c.id NOT IN (
               SELECT course_id FROM course_enrollments WHERE talent_profile_id = ?
             )`,
          [talentProfileId]
        );

        courses = availableCourses;
        total = totalCount?.count || 0;
      } else if (status === 'all') {
        // Buscar TODOS os cursos: inscritos + disponíveis
        // Primeiro, buscar cursos inscritos
        const enrolledCourses = await query<any>(
          `SELECT 
            c.id,
            c.title,
            c.description,
            c.instructor_name,
            c.category,
            c.level,
            c.duration_hours,
            c.price,
            c.price_currency,
            c.enrollment_count,
            c.rating,
            c.rating_count,
            TRUE as is_enrolled,
            ce.enrollment_status,
            ce.progress_percentage,
            ce.enrolled_at,
            ce.completed_at
          FROM course_enrollments ce
          INNER JOIN courses c ON ce.course_id = c.id
          WHERE ce.talent_profile_id = ?
          ORDER BY ce.enrolled_at DESC`,
          [talentProfileId]
        );

        const enrolledIds = enrolledCourses.length > 0 
          ? enrolledCourses.map((c: any) => c.id)
          : ['00000000-0000-0000-0000-000000000000']; // ID dummy para evitar SQL vazio

        // Depois, buscar cursos disponíveis (não inscritos)
        const availableCourses = await query<any>(
          `SELECT 
            c.id,
            c.title,
            c.description,
            c.instructor_name,
            c.category,
            c.level,
            c.duration_hours,
            c.price,
            c.price_currency,
            c.enrollment_count,
            c.rating,
            c.rating_count,
            FALSE as is_enrolled,
            NULL as enrollment_status,
            NULL as progress_percentage,
            NULL as enrolled_at,
            NULL as completed_at
          FROM courses c
          WHERE c.is_active = TRUE
            AND c.id NOT IN (${enrolledIds.map(() => '?').join(',')})
          ORDER BY c.created_at DESC`,
          enrolledIds
        );

        // Combinar e ordenar (inscritos primeiro, depois disponíveis)
        const allCourses = [...enrolledCourses, ...availableCourses];
        
        // Aplicar paginação manualmente após combinar
        courses = allCourses.slice(safeOffset, safeOffset + safeLimit);
        total = allCourses.length;
      } else {
        // Buscar apenas cursos inscritos com status específico
        const whereConditions: string[] = ['ce.talent_profile_id = ?'];
        const params: any[] = [talentProfileId];

        whereConditions.push('ce.enrollment_status = ?');
        params.push(status);

        const enrolledCourses = await query<any>(
          `SELECT 
            c.id,
            c.title,
            c.description,
            c.instructor_name,
            c.category,
            c.level,
            c.duration_hours,
            c.price,
            c.price_currency,
            c.enrollment_count,
            c.rating,
            c.rating_count,
            TRUE as is_enrolled,
            ce.enrollment_status,
            ce.progress_percentage,
            ce.enrolled_at,
            ce.completed_at
          FROM course_enrollments ce
          INNER JOIN courses c ON ce.course_id = c.id
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY ce.enrolled_at DESC
          LIMIT ${safeLimit} OFFSET ${safeOffset}`,
          params
        );

        const totalCount = await queryOne<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM course_enrollments ce
           WHERE ${whereConditions.join(' AND ')}`,
          params
        );

        courses = enrolledCourses;
        total = totalCount?.count || 0;
      }

      // Normalizar dados
      const normalizedCourses = courses.map((course: any) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        instructorName: course.instructor_name,
        category: course.category,
        level: course.level,
        durationHours: course.duration_hours,
        price: course.price ? Number(course.price) : null,
        priceCurrency: course.price_currency,
        enrollmentCount: course.enrollment_count || 0,
        rating: course.rating ? Number(course.rating) : null,
        ratingCount: course.rating_count || 0,
        isEnrolled: Boolean(course.is_enrolled),
        enrollmentStatus: course.enrollment_status || null,
        progress: course.progress_percentage ? Number(course.progress_percentage) : 0,
        enrolledAt: course.enrolled_at,
        completedAt: course.completed_at,
      }));

      res.status(200).json(
        createSuccessResponse({
          courses: normalizedCourses,
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
   * GET /talent/courses/stats
   * Obter estatísticas de cursos
   */
  static async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      // Cursos em progresso
      const inProgress = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM course_enrollments
         WHERE talent_profile_id = ? AND enrollment_status = 'in_progress'`,
        [talentProfileId]
      );

      // Cursos concluídos
      const completed = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM course_enrollments
         WHERE talent_profile_id = ? AND enrollment_status = 'completed'`,
        [talentProfileId]
      );

      // Tempo total (soma das horas dos cursos concluídos)
      const totalTime = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(c.duration_hours), 0) as total
         FROM course_enrollments ce
         INNER JOIN courses c ON ce.course_id = c.id
         WHERE ce.talent_profile_id = ? AND ce.enrollment_status = 'completed'`,
        [talentProfileId]
      );

      res.status(200).json(
        createSuccessResponse({
          emProgresso: inProgress?.count || 0,
          concluidos: completed?.count || 0,
          tempoTotal: `${totalTime?.total || 0}h`,
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

