/**
 * Middleware de upload - Compatível com Vercel Blob em produção
 * Mantém compatibilidade total com código existente
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { config } from '../config/env';
import { generateUUID } from '../utils/uuid';

// Verificar se deve usar Vercel Blob
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.VERCEL;

// Criar diretório de uploads se não existir (apenas em desenvolvimento)
if (!useBlob) {
  const uploadDir = config.upload.uploadPath;
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Criar subdiretórios
  const profilePicturesDir = path.join(uploadDir, 'profile-pictures');
  if (!fs.existsSync(profilePicturesDir)) {
    fs.mkdirSync(profilePicturesDir, { recursive: true });
  }

  const companyDocumentsDir = path.join(uploadDir, 'company-documents');
  if (!fs.existsSync(companyDocumentsDir)) {
    fs.mkdirSync(companyDocumentsDir, { recursive: true });
  }

  const talentDocumentsDir = path.join(uploadDir, 'talent-documents');
  if (!fs.existsSync(talentDocumentsDir)) {
    fs.mkdirSync(talentDocumentsDir, { recursive: true });
  }
}

// Configuração de storage - usar blob em produção, filesystem em desenvolvimento
let profilePictureStorage: multer.StorageEngine;
let companyDocumentStorage: multer.StorageEngine;
let talentDocumentStorage: multer.StorageEngine;

if (useBlob) {
  // Em produção, usar storage customizado que faz upload para blob
  const createBlobStorage = (folder: 'profile-pictures' | 'company-documents' | 'talent-documents') => {
    return {
      _handleFile: async (_req: Request, file: Express.Multer.File, cb: (error?: Error | null, info?: Express.Multer.File) => void) => {
        try {
          const { BlobService } = await import('../services/blob.service');
          const chunks: Buffer[] = [];
          
          file.stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          file.stream.on('end', async () => {
            try {
              const buffer = Buffer.concat(chunks);
              const filename = `${Date.now()}-${generateUUID()}${path.extname(file.originalname)}`;
              
              const result = await BlobService.uploadFile(
                { buffer, originalname: file.originalname, mimetype: file.mimetype },
                folder,
                filename
              );

              cb(null, {
                ...file,
                filename: result.filename,
                path: result.pathname,
                destination: folder,
                size: buffer.length,
              });
            } catch (error) {
              cb(error as Error);
            }
          });

          file.stream.on('error', cb);
        } catch (error) {
          cb(error as Error);
        }
      },
      _removeFile: async (_req: Request, file: Express.Multer.File, cb: (error?: Error | null) => void) => {
        try {
          const { BlobService } = await import('../services/blob.service');
          if (file.path) {
            await BlobService.deleteFile(file.path);
          }
          cb();
        } catch (error) {
          cb(error as Error);
        }
      },
    };
  };

  profilePictureStorage = createBlobStorage('profile-pictures') as any;
  companyDocumentStorage = createBlobStorage('company-documents') as any;
  talentDocumentStorage = createBlobStorage('talent-documents') as any;
} else {
  // Em desenvolvimento, usar filesystem tradicional
  const profilePicturesDir = path.join(config.upload.uploadPath, 'profile-pictures');
  const companyDocumentsDir = path.join(config.upload.uploadPath, 'company-documents');
  const talentDocumentsDir = path.join(config.upload.uploadPath, 'talent-documents');

  profilePictureStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, profilePicturesDir);
    },
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${generateUUID()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

  companyDocumentStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, companyDocumentsDir);
    },
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${generateUUID()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

  talentDocumentStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, talentDocumentsDir);
    },
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${generateUUID()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });
}

// Filtros
const imageFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos de imagem são permitidos (JPEG, PNG, GIF, WebP)'));
  }
};

const documentFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos PDF, DOC, DOCX ou imagens são permitidos'));
  }
};

// Exportar middlewares
export const uploadProfilePicture = multer({
  storage: profilePictureStorage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: imageFilter,
});

export const uploadCompanyDocument = multer({
  storage: companyDocumentStorage,
  limits: { fileSize: config.upload.maxFileSize * 2 },
  fileFilter: documentFilter,
});

export const uploadTalentDocument = multer({
  storage: talentDocumentStorage,
  limits: { fileSize: config.upload.maxFileSize * 2 },
  fileFilter: documentFilter,
});

// Funções de path (mantidas para compatibilidade)
export function getProfilePicturePath(filename: string): string {
  return `/uploads/profile-pictures/${filename}`;
}

export function getCompanyDocumentPath(filename: string): string {
  return `/uploads/company-documents/${filename}`;
}

export function getTalentDocumentPath(filename: string): string {
  return `/uploads/talent-documents/${filename}`;
}

// Funções de delete (usam BlobService quando apropriado)
export async function deleteProfilePicture(filename: string): Promise<void> {
  const pathname = getProfilePicturePath(filename);
  if (useBlob) {
    const { BlobService } = await import('../services/blob.service');
    await BlobService.deleteFile(pathname);
  } else {
    const filePath = path.join(config.upload.uploadPath, 'profile-pictures', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export async function deleteCompanyDocument(filename: string): Promise<void> {
  const pathname = getCompanyDocumentPath(filename);
  if (useBlob) {
    const { BlobService } = await import('../services/blob.service');
    await BlobService.deleteFile(pathname);
  } else {
    const filePath = path.join(config.upload.uploadPath, 'company-documents', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export async function deleteTalentDocument(filename: string): Promise<void> {
  const pathname = getTalentDocumentPath(filename);
  if (useBlob) {
    const { BlobService } = await import('../services/blob.service');
    await BlobService.deleteFile(pathname);
  } else {
    const filePath = path.join(config.upload.uploadPath, 'talent-documents', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

// Funções auxiliares (apenas para desenvolvimento)
export function getProfilePictureFullPath(filename: string): string {
  return path.join(config.upload.uploadPath, 'profile-pictures', filename);
}

export function getCompanyDocumentFullPath(filename: string): string {
  return path.join(config.upload.uploadPath, 'company-documents', filename);
}

export function getTalentDocumentFullPath(filename: string): string {
  return path.join(config.upload.uploadPath, 'talent-documents', filename);
}
