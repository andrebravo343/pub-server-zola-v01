import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../middlewares/errorHandler';
import { createSuccessResponse } from '../utils/response';
import { query, queryOne, execute } from '../utils/database';
import { generateUUID } from '../utils/uuid';

export class CoursesController {
  /**
   * GET /admin/courses
   * Listar cursos/e-books
   */
  static async listCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        search = '',
        status = 'all', // 'all' | 'active' | 'inactive'
        page = 1,
        limit = 10,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 10);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      const whereConditions: string[] = [];
      const params: any[] = [];

      if (search) {
        whereConditions.push('(c.title LIKE ? OR c.description LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam);
      }

      if (status === 'active') {
        whereConditions.push('c.is_active = TRUE');
      } else if (status === 'inactive') {
        whereConditions.push('c.is_active = FALSE');
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM courses c ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      // Buscar cursos
      const courses = await query<any>(
        `SELECT 
          c.id,
          c.title,
          c.description,
          c.instructor_name,
          c.instructor_bio,
          c.category,
          c.level,
          c.course_type,
          c.duration_hours,
          c.content_syllabus,
          c.prerequisites,
          c.price,
          c.price_currency,
          c.is_active,
          c.enrollment_count,
          c.rating,
          c.rating_count,
          c.created_at,
          c.updated_at
        FROM courses c
        ${whereClause}
        ORDER BY c.created_at DESC
        LIMIT ${Math.floor(limitNum)} OFFSET ${Math.floor(offset)}`,
        params
      );

      // Normalizar dados
      const normalizedCourses = courses.map((course: any) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        instructorName: course.instructor_name,
        instructorBio: course.instructor_bio,
        category: course.category,
        level: course.level,
        courseType: course.course_type,
        durationHours: course.duration_hours,
        contentSyllabus: course.content_syllabus,
        prerequisites: course.prerequisites,
        price: course.price,
        priceCurrency: course.price_currency,
        isActive: course.is_active,
        enrollmentCount: course.enrollment_count,
        rating: course.rating,
        ratingCount: course.rating_count,
        createdAt: course.created_at,
        updatedAt: course.updated_at,
      }));

      res.status(200).json(
        createSuccessResponse({
          courses: normalizedCourses,
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
   * POST /admin/courses
   * Criar curso/e-book
   */
  static async createCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        title,
        description,
        instructorName,
        instructorBio,
        category,
        level,
        courseType,
        durationHours,
        contentSyllabus,
        prerequisites,
        price,
        priceCurrency = 'AOA',
        isActive,
        is_active,
        status, // Frontend envia 'status: active/inactive'
      } = req.body;

      // Mapear status para isActive se necessário
      let activeStatus = isActive ?? is_active;
      if (status !== undefined) {
        activeStatus = status === 'active' || status === true;
      }
      if (activeStatus === undefined) {
        activeStatus = true; // Padrão: ativo
      }

      if (!title || !description) {
        throw new CustomError('Título e descrição são obrigatórios', 400);
      }

      // Validar valores de ENUM
      const validLevels = ['beginner', 'intermediate', 'advanced'];
      const validCourseTypes = ['free', 'paid', 'certificate', 'workshop'];

      if (level && !validLevels.includes(level)) {
        throw new CustomError(`Nível inválido. Deve ser um de: ${validLevels.join(', ')}`, 400);
      }

      if (courseType && !validCourseTypes.includes(courseType)) {
        throw new CustomError(`Tipo de curso inválido. Deve ser um de: ${validCourseTypes.join(', ')}`, 400);
      }

      const courseId = generateUUID();
      const now = new Date();

      // Preparar valores para INSERT
      // 18 colunas no total: 16 valores + 2 literais (enrollment_count=0, rating_count=0)
      const insertValues = [
        courseId,                                    // 1. id
        String(title).trim(),                        // 2. title
        String(description).trim(),                 // 3. description
        instructorName ? String(instructorName).trim() : null,  // 4. instructor_name
        instructorBio ? String(instructorBio).trim() : null,    // 5. instructor_bio
        category ? String(category).trim() : null,   // 6. category
        level || null,                               // 7. level
        courseType || 'free',                        // 8. course_type
        durationHours ? Number(durationHours) : null, // 9. duration_hours
        contentSyllabus ? JSON.stringify(contentSyllabus) : null, // 10. content_syllabus
        prerequisites ? String(prerequisites).trim() : null,     // 11. prerequisites
        price ? Number(price) : null,                // 12. price
        String(priceCurrency).trim(),                // 13. price_currency
        Boolean(activeStatus),                       // 14. is_active
        // enrollment_count e rating_count são literais (0, 0) - não entram no array
        now,                                         // 15. created_at
        now,                                         // 16. updated_at
      ];

      // Verificar se temos exatamente 16 valores (18 colunas - 2 literais (0, 0))
      if (insertValues.length !== 16) {
        throw new CustomError(`Erro interno: número incorreto de valores (${insertValues.length} em vez de 16)`, 500);
      }

      await execute(
        `INSERT INTO courses (
          id, title, description, instructor_name, instructor_bio,
          category, level, course_type, duration_hours, content_syllabus,
          prerequisites, price, price_currency, is_active,
          enrollment_count, rating_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        insertValues
      );

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'create_course', 'course', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          courseId,
          JSON.stringify({ title, courseType }),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(201).json(createSuccessResponse({ id: courseId, message: 'Curso criado com sucesso' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/courses/:id
   * Atualizar curso/e-book
   */
  static async updateCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      const updates = req.body;

      // Verificar se o curso existe
      const course = await queryOne<any>(`SELECT id FROM courses WHERE id = ?`, [id]);

      if (!course) {
        throw new CustomError('Curso não encontrado', 404);
      }

      const updateFields: string[] = [];
      const values: any[] = [];

      const allowedFields = [
        'title', 'description', 'instructor_name', 'instructor_bio',
        'category', 'level', 'course_type', 'duration_hours',
        'content_syllabus', 'prerequisites', 'price', 'price_currency', 'is_active',
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          if (field === 'content_syllabus' && updates[field]) {
            updateFields.push(`${field} = ?`);
            values.push(JSON.stringify(updates[field]));
          } else {
            updateFields.push(`${field} = ?`);
            values.push(updates[field]);
          }
        }
      }

      if (updateFields.length === 0) {
        throw new CustomError('Nenhum campo para atualizar', 400);
      }

      updateFields.push('updated_at = ?');
      values.push(new Date());
      values.push(id);

      await execute(`UPDATE courses SET ${updateFields.join(', ')} WHERE id = ?`, values);

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'update_course', 'course', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          id,
          JSON.stringify(updates),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(200).json(createSuccessResponse({ message: 'Curso atualizado com sucesso' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/courses/:id
   * Deletar curso/e-book
   */
  static async deleteCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      // Verificar se o curso existe
      const course = await queryOne<any>(`SELECT id FROM courses WHERE id = ?`, [id]);

      if (!course) {
        throw new CustomError('Curso não encontrado', 404);
      }

      await execute(`DELETE FROM courses WHERE id = ?`, [id]);

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'delete_course', 'course', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          id,
          JSON.stringify({ deleted: true }),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(200).json(createSuccessResponse({ message: 'Curso deletado com sucesso' }));
    } catch (error) {
      next(error);
    }
  }
}

