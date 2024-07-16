import getConfig from 'next/config';

interface RuntimeConfig {
  WHISPER_SERVER_HOST: string;
  WHISPER_SERVER_PORT: string;
  getWebSocketUrl: () => string;
}

const { publicRuntimeConfig } = getConfig();

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

const getConfigValue = (
  key: keyof Omit<RuntimeConfig, 'getWebSocketUrl'>,
): string => {
  const envKey = `NEXT_PUBLIC_${key}` as const;
  const value = publicRuntimeConfig[envKey] || process.env[envKey];
  if (value === undefined || value === null || value === '') {
    throw new ConfigurationError(
      `Configuration value for ${envKey} is not set.`,
    );
  }
  console.log(`Configuration value for ${envKey}: ${value}`);
  return String(value);
};

export const config: RuntimeConfig = {
  WHISPER_SERVER_HOST: getConfigValue('WHISPER_SERVER_HOST'),
  WHISPER_SERVER_PORT: getConfigValue('WHISPER_SERVER_PORT'),
  getWebSocketUrl: () =>
    `wss://${config.WHISPER_SERVER_HOST}:${config.WHISPER_SERVER_PORT}`,
};

console.log('Config values:', {
  WHISPER_SERVER_HOST: config.WHISPER_SERVER_HOST,
  WHISPER_SERVER_PORT: config.WHISPER_SERVER_PORT,
});
