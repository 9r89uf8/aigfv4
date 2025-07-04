/**
 * Simple server file
 * Initializes basic services and starts the Express server
 */
import { createApp } from './app.js';
import { config } from './config/environment.js';
import { initializeFirebase } from './config/firebase.js';
import { initializeDeepSeek } from './config/deepseek.js';
import { initializeSocket } from './config/socket.js';
import { registerMessageHandlers } from './handlers/simpleMessageHandler.js';
import logger from './utils/logger.js';

/**
 * Initialize services and start server
 */
const startServer = async () => {
  try {
    // Initialize Firebase Admin SDK
    logger.info('Initializing Firebase Admin SDK...');
    initializeFirebase();
    
    // Initialize DeepSeek
    logger.info('Initializing DeepSeek...');
    initializeDeepSeek();
    
    // Create Express app
    const app = createApp();
    
    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info(`Server started successfully`, {
        port: config.port,
        environment: config.nodeEnv,
        nodeVersion: process.version,
        services: {
          firebase: 'ready',
          deepseek: config.deepseek.apiKey ? 'ready' : 'not configured'
        }
      });
      logger.info(`Health check available at http://localhost:${config.port}/health`);
    });
    
    // Initialize Socket.io
    logger.info('Initializing Socket.io...');
    const io = initializeSocket(server);
    
    // Register Socket.io handlers
    io.on('connection', (socket) => {
      logger.debug('New socket connection', { socketId: socket.id });
      
      // Basic authentication middleware for socket
      socket.use(async (packet, next) => {
        try {
          const token = socket.handshake.auth.token;
          if (!token) {
            return next(new Error('Authentication required'));
          }
          
          // Verify Firebase token
          const { verifyIdToken } = await import('./config/firebase.js');
          const decodedToken = await verifyIdToken(token);
          socket.userId = decodedToken.uid;
          socket.user = decodedToken;
          
          next();
        } catch (error) {
          logger.error('Socket authentication failed:', error);
          next(new Error('Authentication failed'));
        }
      });
      
      // Register message handlers
      registerMessageHandlers(socket, io);
      
      socket.on('disconnect', () => {
        logger.debug('Socket disconnected', { socketId: socket.id, userId: socket.userId });
      });
    });
    
    logger.info('Socket.io initialized');

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received, starting graceful shutdown...`);
      
      server.close(() => {
        logger.info('HTTP server closed');
        logger.info('Graceful shutdown completed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();