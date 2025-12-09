import { Request, Response, NextFunction } from 'express';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne } from '../../utils/database';

export class PublicCandidatesController {
  /**
   * GET /public/candidates
   * Listar candidatos públicos (sem dados sensíveis, preferencialmente com selo)
   */
  static async listCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        search = '',
        location = '',
        hasZolangolaBadge,
        limit = 10,
      } = req.query;

      const limitNum = Math.max(1, Number(limit) || 10);
      const safeLimit = Math.floor(limitNum);

      // Verificar perfis completos e verificados
      const whereConditions: string[] = [
        'tp.is_verified = TRUE',
        'tu.first_name IS NOT NULL AND tu.first_name != ""',
        'tu.last_name IS NOT NULL AND tu.last_name != ""',
        'tp.title IS NOT NULL AND tp.title != ""',
        'tp.bio IS NOT NULL AND tp.bio != ""',
        '(tp.city IS NOT NULL OR tp.country IS NOT NULL)',
        'EXISTS (SELECT 1 FROM talent_skills ts WHERE ts.talent_profile_id = tp.id)'
      ];
      const params: any[] = [];

      // Busca por texto (especialidade/título)
      if (search) {
        whereConditions.push('(tp.title LIKE ? OR tp.bio LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam);
      }

      // Filtro por localização
      if (location) {
        whereConditions.push('(tp.city LIKE ? OR tp.province LIKE ?)');
        const locationParam = `%${location}%`;
        params.push(locationParam, locationParam);
      }

      // Filtro por badge ZOLANGOLA (preferencialmente com selo)
      if (hasZolangolaBadge !== undefined) {
        whereConditions.push('tp.has_zolangola_badge = ?');
        params.push(hasZolangolaBadge === 'true' ? 1 : 0);
      } else {
        // Por padrão, priorizar candidatos com selo
        // Ordenar por has_zolangola_badge DESC
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Buscar candidatos (sem dados sensíveis: nome, email, telefone, foto)
      const candidates = await query<any>(
        `SELECT 
          tp.id,
          tp.title as especialidade,
          tp.bio as descricao,
          tp.city as localidade,
          tp.province,
          tp.country,
          tp.has_zolangola_badge,
          tp.availability_status,
          (SELECT GROUP_CONCAT(ts.skill_name SEPARATOR ', ') 
           FROM talent_skills ts 
           WHERE ts.talent_profile_id = tp.id 
           LIMIT 5) as skills_summary,
          (SELECT COUNT(*) FROM talent_skills ts WHERE ts.talent_profile_id = tp.id) as skills_count
        FROM talent_profiles tp
        INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
        INNER JOIN users u ON tu.user_id = u.id
        ${whereClause}
        ORDER BY tp.has_zolangola_badge DESC, tp.created_at DESC
        LIMIT ${safeLimit}`,
        params
      );

      // Contar total
      const total = await queryOne<{ count: number }>(
        `SELECT COUNT(DISTINCT tp.id) as count
         FROM talent_profiles tp
         INNER JOIN talent_users tu ON tp.talent_user_id = tu.id
         INNER JOIN users u ON tu.user_id = u.id
         ${whereClause}`,
        params
      );

      // Normalizar dados (sem informações sensíveis)
      const normalizedCandidates = candidates.map((candidate: any) => {
        // Calcular experiência aproximada (se houver dados de experiência)
        let experiencia = 'Não especificado';
        if (candidate.skills_count) {
          if (candidate.skills_count >= 10) {
            experiencia = '10+ anos';
          } else if (candidate.skills_count >= 5) {
            experiencia = '5-10 anos';
          } else if (candidate.skills_count >= 2) {
            experiencia = '2-5 anos';
          } else {
            experiencia = '0-2 anos';
          }
        }

        // Mapear disponibilidade
        const disponibilidadeMap: Record<string, string> = {
          'available': 'Imediata',
          'employed': 'Empregado',
          'in_process': 'Em processo',
        };

        return {
          id: candidate.id,
          especialidade: candidate.especialidade || 'Profissional',
          localidade: candidate.localidade || candidate.province || candidate.country || 'Angola',
          experiencia,
          disponibilidade: disponibilidadeMap[candidate.availability_status] || 'Não especificado',
          avaliacao: 0, // Não temos sistema de avaliação ainda
          avaliacoes: 0,
          descricao: candidate.descricao || '',
          hasZolangolaBadge: Boolean(candidate.has_zolangola_badge),
          skills: candidate.skills_summary ? candidate.skills_summary.split(', ') : [],
        };
      });

      res.status(200).json(
        createSuccessResponse({
          candidates: normalizedCandidates,
          pagination: {
            total: total?.count || 0,
            limit: limitNum,
          },
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

