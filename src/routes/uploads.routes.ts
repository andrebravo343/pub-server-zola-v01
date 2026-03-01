/**
 * Rotas para servir arquivos do Vercel Blob
 * Mantém compatibilidade com URLs /uploads/... do frontend
 */

import { Router, Request, Response } from 'express';
import { head } from '@vercel/blob';

const router = Router();

// Verificar se está usando Vercel Blob
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.VERCEL;

/**
 * GET /uploads/:folder/:filename
 * Proxy para servir arquivos do Vercel Blob mantendo a estrutura de URL
 */
router.get('/uploads/:folder/:filename', async (req: Request, res: Response) => {
  try {
    const { folder, filename } = req.params;
    
    // Validar folder
    const validFolders = ['profile-pictures', 'company-documents', 'talent-documents'];
    if (!validFolders.includes(folder)) {
      return res.status(400).json({
        success: false,
        error: 'Pasta inválida',
      });
    }

    const pathname = `uploads/${folder}/${filename}`;

    // Se não estiver usando blob, servir do filesystem (desenvolvimento)
    if (!useBlob) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'uploads', folder, filename);
      
      if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
      } else {
        return res.status(404).json({
          success: false,
          error: 'Arquivo não encontrado',
        });
      }
    }

    // Em produção, buscar do Vercel Blob
    try {
      // Verificar se arquivo existe
      const blob = await head(pathname);
      
      if (!blob) {
        return res.status(404).json({
          success: false,
          error: 'Arquivo não encontrado',
        });
      }

      // Redirecionar diretamente para URL do blob (mais eficiente)
      if (blob.url) {
        // Definir headers de cache antes do redirect
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        // Redirecionar para URL pública do blob
        return res.redirect(302, blob.url);
      } else {
        return res.status(404).json({
          success: false,
          error: 'Arquivo não encontrado',
        });
      }
    } catch (error: any) {
      if (error.statusCode === 404 || error.message?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Arquivo não encontrado',
        });
      }

      console.error('Erro ao buscar arquivo do blob:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar arquivo',
      });
    }
  } catch (error) {
    console.error('Erro na rota de uploads:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
});

export default router;

