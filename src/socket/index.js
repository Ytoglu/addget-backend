module.exports = function initSocket(io) {
  io.on('connection', socket => {
    console.log('🔌 Socket bağlandı:', socket.id);

    // Kullanıcı kendi odasına katıl
    socket.on('join', userId => {
      socket.join(`user_${userId}`);
      console.log(`👤 ${userId} odasına katıldı`);
    });

    // Mesaj gönder
    socket.on('send_message', async (data) => {
      const { to_id, content, from_name, from_handle, add_id } = data;
      io.to(`user_${to_id}`).emit('new_message', {
        content, from_name, from_handle, add_id,
        created_at: new Date(),
      });
    });

    // Yazıyor göstergesi
    socket.on('typing', ({ to_id, from_name }) => {
      io.to(`user_${to_id}`).emit('user_typing', { from_name });
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket ayrıldı:', socket.id);
    });
  });
};
