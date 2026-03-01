/**
 * Vercel Serverless Function Handler
 * Este arquivo é o ponto de entrada para a Vercel
 */

// Carregar variáveis de ambiente (a Vercel já fornece, mas garantimos compatibilidade)
import dotenv from 'dotenv';
dotenv.config();

// Importar o app Express
import app from '../src/app';

// Exportar como handler serverless da Vercel
export default app;

