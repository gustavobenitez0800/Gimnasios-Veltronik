import apiClient from '../lib/apiClient';

class ClassService {
  async getActiveClasses() {
    const response = await apiClient.get('/gym/classes');
    return response.data;
  }

  async create(classData) {
    const response = await apiClient.post('/gym/classes', classData);
    return response.data;
  }

  async update(id, updates) {
    const response = await apiClient.put(`/gym/classes/${id}`, updates);
    return response.data;
  }

  async delete(id) {
    await apiClient.delete(`/gym/classes/${id}`);
    return true;
  }

  async getBookingsForClass(classId, date) {
    const response = await apiClient.get(`/gym/classes/${classId}/bookings`, {
      params: { date }
    });
    return response.data;
  }

  async createBooking(classId, bookingData) {
    const response = await apiClient.post(`/gym/classes/${classId}/bookings`, bookingData);
    return response.data;
  }

  async deleteBooking(bookingId) {
    await apiClient.delete(`/gym/classes/bookings/${bookingId}`);
    return true;
  }
}

export const classService = new ClassService();
