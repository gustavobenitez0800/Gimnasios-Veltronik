// ============================================
// VELTRONIK - STORAGE SERVICE
// ============================================
// Servicio para manejar subida y bajada de archivos
// con seguridad RLS. Organiza archivos por gym_id.
// ============================================

import { BaseService } from './base/BaseService';
import { compressImage } from '../lib/imageCompression';

const BUCKET_NAME = 'organizations';

class StorageService extends BaseService {
  constructor() {
    super('storage'); // Dummy table name para heredar métodos de orgId
  }

  /**
   * Sube un archivo a la carpeta de la organización de forma segura.
   * Comprime la imagen automáticamente si es necesario.
   *
   * @param {File} file - El archivo a subir
   * @param {string} folder - Subcarpeta lógica (ej: 'profiles', 'receipts')
   * @param {boolean} compress - Si debe intentar comprimirse antes
   * @returns {Promise<string>} - URL pública del archivo
   */
  async uploadFile(file, folder = 'general', compress = true) {
    const orgId = await this._getOrgId();
    if (!orgId) throw new Error('No hay organización vinculada al perfil');

    let fileToUpload = file;
    let fileExt = file.name.split('.').pop().toLowerCase();
    
    // Si se pide compresión y es una imagen compatible, se comprime a WebP
    if (compress && file.type.startsWith('image/') && file.type !== 'image/gif' && file.type !== 'image/svg+xml') {
      try {
        fileToUpload = await compressImage(file, {
          maxWidth: 1024,
          maxHeight: 1024,
          quality: 0.8,
          type: 'image/webp'
        });
        fileExt = 'webp';
      } catch (err) {
        console.warn('Error comprimiendo imagen, subiendo original:', err);
      }
    }

    // Ruta: {org_id}/{folder}/{timestamp}_{random}.{ext}
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${orgId}/${folder}/${fileName}`;

    const { data, error } = await this.client.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileToUpload, {
        cacheControl: '3600',
        upsert: false,
        contentType: fileToUpload.type || file.type
      });

    if (error) {
      console.error('Storage upload error:', error);
      throw new Error(`Error al subir archivo: ${error.message}`);
    }

    // Obtener la URL pública (solo funcionará si el bucket tiene la policy o si generas un signed URL)
    // Usamos getPublicUrl asumiendo que las políticas RLS controlan la vista.
    const { data: publicUrlData } = this.client.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }

  /**
   * Elimina un archivo de la organización actual.
   * @param {string} fileUrlOrPath - URL completa o path relativo
   */
  async deleteFile(fileUrlOrPath) {
    const orgId = await this._getOrgId();
    
    // Extraer path si es una URL completa
    let filePath = fileUrlOrPath;
    if (fileUrlOrPath.includes(BUCKET_NAME)) {
      filePath = fileUrlOrPath.split(`${BUCKET_NAME}/`)[1];
    }

    // Seguridad adicional frontend: asegurarse de que intenta borrar su propia org
    if (!filePath.startsWith(`${orgId}/`)) {
      throw new Error('No tienes permisos para borrar archivos de otra organización');
    }

    const { error } = await this.client.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      throw new Error(`Error al eliminar archivo: ${error.message}`);
    }
    return true;
  }
}

export const storageService = new StorageService();
