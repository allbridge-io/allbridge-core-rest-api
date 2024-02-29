import { Logger, LoggerCredential } from '@allbridge/logger';
import { ConfigService } from '../service/config.service';

let loggerCredential: LoggerCredential;
const loggers: Record<string, Logger> = {};

export function getLogger(context: string): Logger {
  console.log(context);
  if (loggers[context]) {
    return loggers[context];
  }
  if (!loggerCredential) {
    loggerCredential = ConfigService.getLoggerCredential();
  }

  const logger = new Logger(context, loggerCredential);
  loggers[context] = logger;
  return logger;
}
