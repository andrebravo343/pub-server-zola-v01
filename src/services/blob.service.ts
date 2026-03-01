/**
 * Serviço para gerenciar uploads usando Vercel Blob Storage
 * Mantém compatibilidade com a estrutura de URLs existente
 */

import { put, del, head } from '@vercel/blob';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

// Verificar se está usando Vercel Blob
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.VERCEL;

export interface BlobUploadResult {
  url: string;
  pathname: string; // Caminho relativo para compatibilidade (/uploads/...)
  filename: string;
}

export class BlobService {
  /**
   * Upload de arquivo para Vercel Blob
   * Mantém a mesma estrutura de pastas: profile-pictures, company-documents, talent-documents
   */
  static async uploadFile(
    file: Express.Multer.File | { buffer: Buffer; originalname: string; mimetype: string },
    folder: 'profile-pictures' | 'company-documents' | 'talent-documents',
    filename?: string
  ): Promise<BlobUploadResult> {
    // Se não estiver usando blob (desenvolvimento local), usar filesystem
    if (!useBlob) {
      return this.uploadToLocal(file, folder, filename);
    }

    try {
      // Gerar nome único se não fornecido
      const finalFilename = filename || this.generateUniqueFilename(file.originalname);
      
      // Criar pathname mantendo a estrutura: uploads/folder/filename
      const pathname = `uploads/${folder}/${finalFilename}`;

      // Converter buffer para stream se necessário
      let fileStream: Readable;
      if ('buffer' in file && file.buffer) {
        fileStream = Readable.from(file.buffer);
      } else if ('path' in file && file.path) {
        fileStream = fs.createReadStream(file.path);
      } else {
        throw new Error('Arquivo inválido: deve ter buffer ou path');
      }

      // Upload para Vercel Blob
      const blob = await put(pathname, fileStream, {
        access: 'public',
        contentType: file.mimetype,
        addRandomSuffix: false, // Usamos nosso próprio nome único
      });

      // Limpar arquivo temporário se existir
      if ('path' in file && file.path && typeof file.path === 'string' && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      return {
        url: blob.url,
        pathname: `/uploads/${folder}/${finalFilename}`, // Manter estrutura de URL
        filename: finalFilename,
      };
    } catch (error) {
      console.error('Erro ao fazer upload para Vercel Blob:', error);
      throw error;
    }
  }

  /**
   * Deletar arquivo do Vercel Blob
   */
  static async deleteFile(
    pathname: string
  ): Promise<void> {
    // Se não estiver usando blob, deletar do filesystem
    if (!useBlob) {
      return this.deleteFromLocal(pathname);
    }

    try {
      // Extrair o pathname do blob (remover /uploads/ se presente)
      const blobPathname = pathname.startsWith('/uploads/')
        ? pathname.substring(1) // Remove leading /
        : pathname;

      await del(blobPathname);
    } catch (error) {
      console.error('Erro ao deletar arquivo do Vercel Blob:', error);
      // Não lançar erro se arquivo não existir
      if (error instanceof Error && !error.message.includes('not found')) {
        throw error;
      }
    }
  }

  /**
   * Verificar se arquivo existe no Blob
   */
  static async fileExists(pathname: string): Promise<boolean> {
    if (!useBlob) {
      return this.localFileExists(pathname);
    }

    try {
      const blobPathname = pathname.startsWith('/uploads/')
        ? pathname.substring(1)
        : pathname;
      
      await head(blobPathname);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obter URL pública do arquivo
   * Retorna URL do blob em produção ou URL local em desenvolvimento
   */
  static getFileUrl(pathname: string, baseUrl?: string): string {
    // Se usar blob, o pathname já contém a URL completa ou relativa
    if (useBlob) {
      // Se pathname já é uma URL completa, retornar
      if (pathname.startsWith('http')) {
        return pathname;
      }
      // Caso contrário, construir URL do blob
      // Em produção, o blob retorna URL completa, então retornamos o pathname
      // que será usado pela rota proxy
      return pathname;
    }

    // Em desenvolvimento local, usar baseUrl
    if (baseUrl) {
      return `${baseUrl}${pathname}`;
    }

    return pathname;
  }

  /**
   * Upload para filesystem local (desenvolvimento)
   */
  private static async uploadToLocal(
    file: Express.Multer.File | { buffer: Buffer; originalname: string; mimetype: string },
    folder: 'profile-pictures' | 'company-documents' | 'talent-documents',
    filename?: string
  ): Promise<BlobUploadResult> {
    const uploadDir = path.join(config.upload.uploadPath, folder);
    
    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const finalFilename = filename || this.generateUniqueFilename(file.originalname);
    const filePath = path.join(uploadDir, finalFilename);

    // Salvar arquivo
    if ('buffer' in file && file.buffer) {
      fs.writeFileSync(filePath, file.buffer);
    } else if ('path' in file && file.path) {
      fs.copyFileSync(file.path, filePath);
    } else {
      throw new Error('Arquivo inválido: deve ter buffer ou path');
    }

    return {
      url: filePath,
      pathname: `/uploads/${folder}/${finalFilename}`,
      filename: finalFilename,
    };
  }

  /**
   * Deletar do filesystem local
   */
  private static deleteFromLocal(pathname: string): void {
    const filePath = path.join(process.cwd(), pathname);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Verificar se arquivo existe localmente
   */
  private static localFileExists(pathname: string): boolean {
    const filePath = path.join(process.cwd(), pathname);
    return fs.existsSync(filePath);
  }

  /**
   * Gerar nome único para arquivo
   */
  private static generateUniqueFilename(originalname: string): string {
    const { generateUUID } = require('../utils/uuid');
    const ext = path.extname(originalname);
    return `${Date.now()}-${generateUUID()}${ext}`;
  }
}

export default BlobService;

