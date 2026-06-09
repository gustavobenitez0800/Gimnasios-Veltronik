// ============================================
// VELTRONIK - STORAGE SERVICE
// ============================================
// Migración pendiente de Supabase Storage a Java (S3 / Local).
// ============================================

class StorageService {
  async uploadFile(file, _folder = 'general', _compress = true) {
    console.warn("Upload feature temporarily disabled during Java migration.");
    // Dummy URL until Java implementation is ready
    return `https://dummyimage.com/600x400/000/fff&text=${encodeURIComponent(file.name)}`;
  }

  async deleteFile(_path) {
    console.warn("Delete file feature temporarily disabled during Java migration.");
    return true;
  }
}

export const storageService = new StorageService();
