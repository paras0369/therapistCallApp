const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Therapist = require('../models/Therapist');
const Call = require('../models/Call');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const connectedUsers = new Map();
const activeCalls = new Map();

const socketHandler = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const decoded = jwt.verify(token, JWT_SECRET);
      
      if (decoded.userType === 'user') {
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) {
          return next(new Error('User not found or inactive'));
        }
        socket.user = user;
        socket.userType = 'user';
      } else if (decoded.userType === 'therapist') {
        const therapist = await Therapist.findById(decoded.therapistId);
        if (!therapist || !therapist.isActive) {
          return next(new Error('Therapist not found or inactive'));
        }
        socket.therapist = therapist;
        socket.userType = 'therapist';
      } else {
        return next(new Error('Invalid token'));
      }
      
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`${socket.userType} connected:`, socket.id);
    
    const userId = socket.userType === 'user' ? socket.user._id.toString() : socket.therapist._id.toString();
    console.log(`Adding ${socket.userType} to connected users with ID:`, userId);
    
    connectedUsers.set(userId, {
      socketId: socket.id,
      userType: socket.userType,
      userData: socket.userType === 'user' ? socket.user : socket.therapist
    });
    
    console.log('Current connected users:', Array.from(connectedUsers.keys()));

    socket.on('initiate-call', async (data) => {
      try {
        console.log('Initiate call received:', data);
        console.log('Connected users:', Array.from(connectedUsers.keys()));
        
        if (socket.userType !== 'user') return;

        const { therapistId } = data;
        const therapistConnection = connectedUsers.get(therapistId);
        
        console.log('Looking for therapist:', therapistId);
        console.log('Therapist connection found:', therapistConnection);
        
        if (!therapistConnection || therapistConnection.userType !== 'therapist') {
          console.log('Therapist not available or not connected');
          socket.emit('call-rejected', { message: 'Therapist not available' });
          return;
        }

        const call = new Call({
          userId: socket.user._id,
          therapistId,
          startTime: new Date(),
          status: 'initiated'
        });

        await call.save();

        activeCalls.set(call._id.toString(), {
          callId: call._id.toString(),
          userId: socket.user._id.toString(),
          therapistId,
          userSocketId: socket.id,
          therapistSocketId: therapistConnection.socketId,
          startTime: new Date()
        });

        console.log('Emitting call-request to therapist socket:', therapistConnection.socketId);
        io.to(therapistConnection.socketId).emit('call-request', {
          callId: call._id.toString(),
          userName: socket.user.phoneNumber,
          userId: socket.user._id.toString()
        });
        console.log('Call request sent to therapist');

      } catch (error) {
        console.error('Initiate call error:', error);
        socket.emit('call-rejected', { message: 'Failed to initiate call' });
      }
    });

    socket.on('accept-call', async (data) => {
      try {
        if (socket.userType !== 'therapist') return;

        const { callId } = data;
        const callData = activeCalls.get(callId);
        
        if (!callData) {
          socket.emit('call-rejected', { message: 'Call not found' });
          return;
        }

        await Call.findByIdAndUpdate(callId, { 
          status: 'accepted'
        });

        callData.status = 'active';
        callData.acceptedAt = new Date();
        activeCalls.set(callId, callData);

        io.to(callData.userSocketId).emit('call-accepted', {
          callId,
          therapistName: socket.therapist.name
        });

        socket.emit('call-accepted', {
          callId,
          userName: callData.userName
        });

      } catch (error) {
        console.error('Accept call error:', error);
        socket.emit('call-rejected', { message: 'Failed to accept call' });
      }
    });

    socket.on('reject-call', async (data) => {
      try {
        const { callId } = data;
        const callData = activeCalls.get(callId);
        
        if (!callData) return;

        await Call.findByIdAndUpdate(callId, { 
          status: 'rejected',
          endTime: new Date()
        });

        io.to(callData.userSocketId).emit('call-rejected', {
          callId,
          message: 'Call was rejected'
        });

        activeCalls.delete(callId);

      } catch (error) {
        console.error('Reject call error:', error);
      }
    });

    socket.on('end-call', async (data) => {
      try {
        const { callId, duration, endedBy } = data;
        const callData = activeCalls.get(callId);
        
        if (!callData) return;

        const actualDuration = duration || Math.ceil((new Date() - callData.acceptedAt) / 60000);
        const userCost = actualDuration * 6;
        let therapistEarnings = actualDuration * 2;
        
        if (actualDuration >= 10) {
          therapistEarnings = actualDuration * 2.5;
        }

        // Determine who ended the call
        const userType = socket.userType;
        const endReason = userType === 'user' ? 'user ended the call' : 'therapist ended the call';

        await Promise.all([
          Call.findByIdAndUpdate(callId, {
            status: 'completed',
            endTime: new Date(),
            duration: actualDuration,
            userCost,
            therapistEarnings
          }),
          User.findByIdAndUpdate(callData.userId, { 
            $inc: { coins: -userCost } 
          }),
          Therapist.findByIdAndUpdate(callData.therapistId, { 
            $inc: { totalEarnings: therapistEarnings } 
          })
        ]);

        io.to(callData.userSocketId).emit('call-ended', {
          callId,
          duration: actualDuration,
          cost: userCost,
          reason: endReason
        });

        io.to(callData.therapistSocketId).emit('call-ended', {
          callId,
          duration: actualDuration,
          earnings: therapistEarnings,
          reason: endReason
        });

        activeCalls.delete(callId);

      } catch (error) {
        console.error('End call error:', error);
      }
    });

    socket.on('offer', (data) => {
      const { offer, callId } = data;
      const callData = activeCalls.get(callId);
      
      console.log('Received offer for call:', callId);
      console.log('Call data exists:', !!callData);
      console.log('Therapist socket ID:', callData?.therapistSocketId);
      
      if (callData && callData.therapistSocketId) {
        console.log('Forwarding offer to therapist');
        io.to(callData.therapistSocketId).emit('offer', { offer, callId });
      } else {
        console.log('Could not forward offer - call data or therapist socket missing');
      }
    });

    socket.on('answer', (data) => {
      const { answer, callId } = data;
      const callData = activeCalls.get(callId);
      
      console.log('Received answer for call:', callId);
      console.log('Call data exists:', !!callData);
      console.log('User socket ID:', callData?.userSocketId);
      
      if (callData && callData.userSocketId) {
        console.log('Forwarding answer to user');
        io.to(callData.userSocketId).emit('answer', { answer, callId });
      } else {
        console.log('Could not forward answer - call data or user socket missing');
      }
    });

    socket.on('ice-candidate', (data) => {
      const { candidate, callId } = data;
      const callData = activeCalls.get(callId);
      
      console.log('Received ICE candidate for call:', callId);
      console.log('From socket:', socket.id);
      
      if (callData) {
        const targetSocketId = socket.id === callData.userSocketId 
          ? callData.therapistSocketId 
          : callData.userSocketId;
        
        console.log('Forwarding ICE candidate to:', targetSocketId);
        
        if (targetSocketId) {
          io.to(targetSocketId).emit('ice-candidate', { candidate, callId });
        } else {
          console.log('No target socket found for ICE candidate');
        }
      } else {
        console.log('No call data found for ICE candidate');
      }
    });

    socket.on('disconnect', () => {
      console.log(`${socket.userType} disconnected:`, socket.id);
      
      const userId = socket.userType === 'user' ? socket.user._id.toString() : socket.therapist._id.toString();
      connectedUsers.delete(userId);

      for (const [callId, callData] of activeCalls) {
        if (callData.userSocketId === socket.id || callData.therapistSocketId === socket.id) {
          const otherSocketId = callData.userSocketId === socket.id 
            ? callData.therapistSocketId 
            : callData.userSocketId;
          
          if (otherSocketId) {
            const disconnectReason = socket.userType === 'user' ? 
              'user disconnected' : 'therapist disconnected';
            io.to(otherSocketId).emit('call-ended', {
              callId,
              reason: disconnectReason
            });
          }
          
          activeCalls.delete(callId);
          
          Call.findByIdAndUpdate(callId, {
            status: 'cancelled',
            endTime: new Date()
          }).catch(console.error);
        }
      }
    });
  });
};

module.exports = socketHandler;