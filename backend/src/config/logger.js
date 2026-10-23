import winston from 'winston';
import env from './env.js';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const developmentFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: time, stack, ...meta }) => {
    const metaText = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${time} ${level}: ${stack || message}${metaText}`;
  }),
);

const productionFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = winston.createLogger({
  level: env.logLevel,
  format: env.isProduction ? productionFormat : developmentFormat,
  transports: [new winston.transports.Console()],
});

export default logger;
