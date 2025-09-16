// Structured logging helper
export const logger = {
  info: (message: string, data?: any) => {
    console.log(
      JSON.stringify({
        level: 'INFO',
        timestamp: new Date().toISOString(),
        message,
        data: data || {},
      })
    );
  },
  error: (message: string, error?: any) => {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        message,
        error: error?.message || error,
      })
    );
  },
  warn: (message: string, data?: any) => {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        timestamp: new Date().toISOString(),
        message,
        data: data || {},
      })
    );
  },
  debug: (message: string, data?: any) => {
    console.log(
      JSON.stringify({
        level: 'DEBUG',
        timestamp: new Date().toISOString(),
        message,
        data: data || {},
      })
    );
  },
};

// Performance timing helper
export const performance = {
  start: (label: string) => {
    const start = Date.now();
    return {
      end: () => {
        const duration = Date.now() - start;
        logger.debug(`Performance: ${label}`, { duration: `${duration}ms` });
        return duration;
      },
    };
  },
};
