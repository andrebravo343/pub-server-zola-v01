import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { config } from '../config/env';
import { generateUUID } from '../utils/uuid';

// Criar diretório de uploads se não existir
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

// Configuração de storage para fotos de perfil
const profilePictureStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, profilePicturesDir);
  },
  filename: (_req, file, cb) => {
    // Gerar nome único: timestamp-uuid.extensão
    const uniqueName = `${Date.now()}-${generateUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Filtro para validar apenas imagens
const imageFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos de imagem são permitidos (JPEG, PNG, GIF, WebP)'));
  }
};

// Configuração do multer para fotos de perfil
export const uploadProfilePicture = multer({
  storage: profilePictureStorage,
  limits: {
    fileSize: config.upload.maxFileSize, // 5MB por padrão
  },
  fileFilter: imageFilter,
});

// Função para obter o caminho relativo da foto de perfil
export function getProfilePicturePath(filename: string): string {
  return `/uploads/profile-pictures/${filename}`;
}

// Função para obter o caminho completo do arquivo
export function getProfilePictureFullPath(filename: string): string {
  return path.join(profilePicturesDir, filename);
}

// Função para deletar arquivo de foto de perfil
export function deleteProfilePicture(filename: string): void {
  const filePath = getProfilePictureFullPath(filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Configuração de storage para documentos de empresas
const companyDocumentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, companyDocumentsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${generateUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Configuração de storage para documentos de talentos
const talentDocumentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, talentDocumentsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${generateUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Filtro para validar documentos (PDF, imagens)
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

// Configuração do multer para documentos de empresas
export const uploadCompanyDocument = multer({
  storage: companyDocumentStorage,
  limits: {
    fileSize: config.upload.maxFileSize * 2, // 10MB para documentos
  },
  fileFilter: documentFilter,
});

// Configuração do multer para documentos de talentos
export const uploadTalentDocument = multer({
  storage: talentDocumentStorage,
  limits: {
    fileSize: config.upload.maxFileSize * 2, // 10MB para documentos
  },
  fileFilter: documentFilter,
});

// Funções para obter caminhos de documentos
export function getCompanyDocumentPath(filename: string): string {
  return `/uploads/company-documents/${filename}`;
}

export function getTalentDocumentPath(filename: string): string {
  return `/uploads/talent-documents/${filename}`;
}

export function getCompanyDocumentFullPath(filename: string): string {
  return path.join(companyDocumentsDir, filename);
}

export function getTalentDocumentFullPath(filename: string): string {
  return path.join(talentDocumentsDir, filename);
}

