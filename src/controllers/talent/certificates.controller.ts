import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne } from '../../utils/database';
import { getOrCreateTalentProfileId } from '../../utils/talentHelper';

export class TalentCertificatesController {
  /**
   * GET /talent/certificates
   * Listar certificados do talento
   */
  static async listCertificates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { talentProfileId } = await getOrCreateTalentProfileId(userId);

      const {
        page = 1,
        limit = 20,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor((pageNum - 1) * limitNum);

      // Buscar certificados
      const certificates = await query<any>(
        `SELECT 
          cert.id,
          cert.certificate_number,
          cert.title,
          cert.description,
          cert.certificate_type,
          cert.issued_at,
          cert.expires_at,
          cert.is_revoked,
          cert.verification_url,
          cert.qr_code_url,
          cert.pdf_url,
          c.title as course_title,
          c.id as course_id
        FROM certificates cert
        LEFT JOIN courses c ON cert.course_id = c.id
        WHERE cert.talent_profile_id = ? AND cert.is_revoked = FALSE
        ORDER BY cert.issued_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        [talentProfileId]
      );

      // Contar total
      const total = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM certificates
         WHERE talent_profile_id = ? AND is_revoked = FALSE`,
        [talentProfileId]
      );

      // Normalizar dados
      const normalizedCertificates = certificates.map((cert: any) => ({
        id: cert.id,
        certificateNumber: cert.certificate_number,
        title: cert.title,
        description: cert.description,
        type: cert.certificate_type,
        issuedAt: cert.issued_at,
        expiresAt: cert.expires_at,
        isRevoked: Boolean(cert.is_revoked),
        verified: !cert.is_revoked,
        verificationUrl: cert.verification_url,
        qrCodeUrl: cert.qr_code_url,
        pdfUrl: cert.pdf_url,
        courseTitle: cert.course_title,
        courseId: cert.course_id,
        issuer: cert.course_title || 'Zolangola',
        date: cert.issued_at ? new Date(cert.issued_at).toLocaleDateString('pt-AO') : '',
        credentialId: cert.certificate_number,
      }));

      res.status(200).json(
        createSuccessResponse({
          certificates: normalizedCertificates,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: total?.count || 0,
            totalPages: Math.ceil((total?.count || 0) / limitNum),
          },
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

