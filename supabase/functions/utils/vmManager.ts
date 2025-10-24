import { logger } from './logger.ts';

export async function startVM(): Promise<boolean> {
  try {
    const vmAppName =
      Deno.env.get('VM_APP_NAME') || 'fantasy-football-assistant-vm';
    const flyApiToken = Deno.env.get('FLY_API_TOKEN');

    if (!flyApiToken) {
      logger.error(
        'FLY_API_TOKEN environment variable not set for VM management'
      );
      return false;
    }

    // First, list all machines to see if one already exists
    const listResponse = await fetch(
      `https://api.machines.dev/v1/apps/${vmAppName}/machines`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${flyApiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      logger.error('Failed to list machines', {
        status: listResponse.status,
        errorText,
        appName: vmAppName,
      });
      return false;
    }

    const machines = await listResponse.json();
    logger.info('Retrieved machines', {
      count: machines.length,
      appName: vmAppName,
    });

    // If we have machines, start the first one
    if (machines.length > 0) {
      const machine = machines[0];
      logger.info('Found existing machine, starting it', {
        machineId: machine.id,
        machineName: machine.name,
        currentState: machine.state,
      });

      const startResponse = await fetch(
        `https://api.machines.dev/v1/apps/${vmAppName}/machines/${machine.id}/start`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${flyApiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (startResponse.ok) {
        logger.info('Machine started successfully', {
          machineId: machine.id,
          appName: vmAppName,
        });
        return true;
      } else {
        const errorText = await startResponse.text();
        logger.error('Failed to start existing machine', {
          status: startResponse.status,
          errorText,
          machineId: machine.id,
        });
        return false;
      }
    } else {
      // No machines found, create a new one
      logger.info('No existing machines found, creating new one', {
        appName: vmAppName,
      });

      const createResponse = await fetch(
        `https://api.machines.dev/v1/apps/${vmAppName}/machines`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${flyApiToken}`,
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

      if (createResponse.ok) {
        const machineData = await createResponse.json();
        logger.info('New machine created and started successfully', {
          machineId: machineData.id,
          appName: vmAppName,
        });
        return true;
      } else {
        const errorText = await createResponse.text();
        logger.error('Failed to create new machine', {
          status: createResponse.status,
          errorText,
          appName: vmAppName,
        });
        return false;
      }
    }
  } catch (error) {
    logger.error('Error managing VM', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
