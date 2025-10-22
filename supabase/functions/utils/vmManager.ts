import { logger } from './logger.ts';

export async function startVM(): Promise<void> {
  try {
    const vmAppName = Deno.env.get('VM_APP_NAME') || 'fantasy-football-sync-vm';

    // Use Fly API to start a VM
    const response = await fetch(
      `https://api.machines.dev/v1/apps/${vmAppName}/machines`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('FLY_API_TOKEN')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            image: `${vmAppName}:latest`,
            env: {
              NODE_ENV: 'production',
            },
          },
        }),
      }
    );

    if (response.ok) {
      const machineData = await response.json();
      logger.info('VM started successfully', {
        machineId: machineData.id,
        appName: vmAppName,
      });
    } else {
      const errorText = await response.text();
      logger.error('Failed to start VM', {
        status: response.status,
        errorText,
        appName: vmAppName,
      });
    }
  } catch (error) {
    logger.error('Error starting VM', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
